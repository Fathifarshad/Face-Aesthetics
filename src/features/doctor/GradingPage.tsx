import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BottomBar, Button, Header, Notice, Tag } from '../../components/ui';
import { AUTO_GRADED, BILATERAL, SCALES } from '../../data/concerns';
import { GRADE_THRESHOLDS } from '../../data/gradeThresholds';
import { CONCERN_IDS, type ConcernId, type Grade, type Review } from '../../data/types';
import type { AutoGrade } from '../../engine/grading';
import { frontalPhoto } from '../../db/repo';
import { listGrades, reviewGrade, saveAutoGrades } from '../../db/simRepo';
import type { GradeRow } from '../../db/types';
import { useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';
import { useEngine, type EngineMessage } from './useEngine';

const GRADES: Grade[] = [0, 1, 2, 3, 4];
type Problem = Extract<EngineMessage, { type: 'grades' }>['problems'][number];

/** Review that a grade choice means: the suggestion itself is a confirmation, anything else an edit. */
const reviewFor = (row: GradeRow, grade: Grade): Review =>
  row.autoGrade !== null && grade === row.autoGrade ? 'confirmed' : 'edited';

/** Same suggestions as stored: nothing to save (avoids an audit entry on every visit). */
const unchanged = (rows: readonly GradeRow[], grades: readonly AutoGrade[], photoId: string) =>
  grades.every((g) => {
    const r = rows.find((x) => x.concernId === g.concernId && x.side === g.side);
    return (
      r &&
      r.photoId === photoId &&
      r.index !== null &&
      Math.abs(r.index - g.index) < 1e-6 &&
      r.confidence === g.confidence
    );
  });

/**
 * Grading (docs/PRD.md F2): an automatic 0–4 suggestion with a confidence for the concerns a photo can show as
 * shading, a manual grade for volume and shape (owner decision 2026-11-15), and the doctor's review of each.
 * Only confirmed or edited grades reach the simulation (F2.4).
 */
export function GradingPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const num = useNum();
  const nav = useNavigate();
  const data = useCase(caseId);
  const photo = useLive(async () => (await frontalPhoto(caseId)) ?? null, [caseId]);
  const rows = useLive(() => listGrades(caseId), [caseId]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [problems, setProblems] = useState<Problem[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [selected, setSelected] = useState<ConcernId | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const engine = useEngine(photo, (msg) => {
    if (msg.type !== 'grades' || !photo) return;
    setMeasuring(false);
    setProblems(msg.problems);
    if (!rowsRef.current || !unchanged(rowsRef.current, msg.grades, photo.id))
      void saveAutoGrades(caseId, photo.id, msg.grades);
  });
  const { ready, post, work, status } = engine;

  const measure = () => {
    setMeasuring(true);
    post({ type: 'grade', pose: photo?.pose ?? null });
  };

  // Draw the working copy and measure once the photo is prepared.
  useEffect(() => {
    if (!ready || !canvas.current || !work.current) return;
    const c = canvas.current;
    c.width = ready.rect.width;
    c.height = ready.rect.height;
    c.getContext('2d')!.drawImage(work.current, -ready.rect.x, -ready.rect.y);
    setMeasuring(true);
    post({ type: 'grade', pose: photo?.pose ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!data || !rows) return null;
  const { patient } = data;
  const sideName = (side: GradeRow['side']) => (side === 'R' ? t.sim.right : side === 'L' ? t.sim.left : '');
  const reviewedCount = CONCERN_IDS.filter((id) =>
    rows.filter((r) => r.concernId === id).every((r) => r.reviewed !== 'pending'),
  ).length;
  const sure = rows.filter((r) => r.reviewed === 'pending' && r.confidence === 'high');
  const noEngine = status === 'no-photo' || status === 'no-face' || status === 'error';

  const confirm = (id: ConcernId) => {
    for (const r of rows.filter((x) => x.concernId === id))
      void reviewGrade(r, { reviewed: reviewFor(r, r.grade) });
  };
  const reject = (id: ConcernId) => {
    for (const r of rows.filter((x) => x.concernId === id)) void reviewGrade(r, { reviewed: 'rejected' });
  };
  const undo = (id: ConcernId) => {
    for (const r of rows.filter((x) => x.concernId === id))
      void reviewGrade(r, { reviewed: 'pending', grade: r.autoGrade ?? r.grade });
  };

  return (
    <>
      <Header title={`${t.grading.title} — ${patient.displayName}`} back={`/doctor/case/${caseId}/capture`} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+var(--tabbar-h))] pt-4">
        <CaseSteps caseId={caseId} />
        <p className="mb-2 text-body text-ink-2">{t.grading.intro}</p>
        <div className="mb-3 flex flex-col gap-2">
          <Notice>{t.grading.approx}</Notice>
          {noEngine && <Notice tone="warn">{t.grading.noPhoto}</Notice>}
          {problems.map((p) => (
            <Notice key={p} tone="warn">
              {t.grading.problems[p]}
            </Notice>
          ))}
        </div>

        <div className={ready ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-5' : ''}>
          <div
            className={
              ready ? 'sticky top-[69px] z-10 -mx-4 bg-bg px-4 pb-2 lg:top-[85px] lg:mx-0 lg:px-0' : 'hidden'
            }
          >
            <div className="flex justify-center rounded-photo bg-photo">
              <div dir="ltr" className="relative overflow-hidden rounded-photo">
                <canvas
                  ref={canvas}
                  role="img"
                  aria-label={t.sim.before}
                  className="block h-auto max-h-[34vh] w-auto max-w-full lg:max-h-[calc(100vh-190px)]"
                />
                {ready && selected && (
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox={`0 0 ${ready.rect.width} ${ready.rect.height}`}
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    {ready.outlines
                      .filter((o) => o.concernId === selected)
                      .map((o) => (
                        <polygon
                          key={o.side}
                          points={o.points.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}
                          className="fill-primary/10 stroke-primary"
                          strokeWidth={Math.max(1.5, ready.rect.width / 260)}
                        />
                      ))}
                  </svg>
                )}
              </div>
            </div>
          </div>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption text-muted" data-testid="reviewed-count">
                {t.grading.reviewed(num(reviewedCount), num(CONCERN_IDS.length))}
              </span>
              {ready && (
                <Button onClick={measure} disabled={measuring}>
                  {measuring ? t.grading.running : t.grading.redo}
                </Button>
              )}
            </div>
            {sure.length > 0 && (
              <Button
                className="mb-2 w-full"
                onClick={() => sure.forEach((r) => void reviewGrade(r, { reviewed: 'confirmed' }))}
              >
                {t.grading.confirmAll(num(sure.length))}
              </Button>
            )}
            <ul className="flex flex-col gap-2">
              {CONCERN_IDS.map((id) => {
                const own = rows.filter((r) => r.concernId === id);
                const auto = AUTO_GRADED.has(id);
                const status = own.every((r) => r.reviewed === own[0]!.reviewed)
                  ? own[0]!.reviewed
                  : 'edited';
                const pending = own.some((r) => r.reviewed === 'pending');
                const rejected = own.every((r) => r.reviewed === 'rejected');
                const name = t.concerns[id];
                const scale = SCALES.names[id];
                return (
                  <li
                    key={id}
                    id={`grade-${id}`}
                    onPointerDown={() => setSelected(id)}
                    onFocusCapture={() => setSelected(id)}
                    className={`rounded-md border px-3 py-2 ${selected === id ? 'border-primary' : 'border-border'} ${rejected ? 'opacity-60' : 'bg-surface'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 text-body font-semibold">{name}</h3>
                      <Tag tone={status === 'pending' ? 'warn' : status === 'rejected' ? 'neutral' : 'ok'}>
                        {t.grading.status[status]}
                      </Tag>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Tag tone={auto ? 'primary' : 'neutral'}>
                        {auto ? t.grading.auto : t.grading.manual}
                      </Tag>
                      {auto && GRADE_THRESHOLDS[id]?.status === 'draft' && (
                        <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">
                          {t.grading.unverified}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-caption text-muted">
                      {t.grading.scale}: {scale ? <bdi dir="ltr">{scale}</bdi> : t.grading.noScale}
                      {scale && SCALES.status === 'draft' && (
                        <span className="ms-2 inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">
                          {t.grading.unverified}
                        </span>
                      )}
                    </p>

                    {own.map((r) => (
                      <div key={r.side} className="mt-2">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-caption text-ink-2">
                          {BILATERAL.has(id) && <span className="font-semibold">{sideName(r.side)}</span>}
                          {r.autoGrade !== null && r.confidence && (
                            <span>
                              {t.grading.auto}: <bdi>{t.sim.gradeOf(num(r.autoGrade))}</bdi> ·{' '}
                              {t.grading.confidence[r.confidence]}
                            </span>
                          )}
                        </div>
                        <div
                          className="flex gap-1.5"
                          role="radiogroup"
                          aria-label={t.grading.gradeLabel(name, sideName(r.side))}
                        >
                          {GRADES.map((g) => {
                            const on = r.grade === g && (r.reviewed !== 'pending' || r.autoGrade !== null);
                            return (
                              <button
                                key={g}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => void reviewGrade(r, { grade: g, reviewed: reviewFor(r, g) })}
                                className={`flex h-11 min-w-11 flex-1 items-center justify-center rounded-md border text-control ${
                                  on
                                    ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint'
                                    : 'border-border text-ink'
                                } ${r.autoGrade === g ? 'underline decoration-primary decoration-2 underline-offset-4' : ''}`}
                              >
                                <bdi>{num(g)}</bdi>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    <div className="mt-2 flex flex-wrap gap-2">
                      {pending && !own.every((r) => r.autoGrade === null) && (
                        <Button
                          variant="primary"
                          onClick={() => confirm(id)}
                          aria-label={`${t.grading.confirm} ${name}`}
                        >
                          {t.grading.confirm}
                        </Button>
                      )}
                      {!rejected && (
                        <Button onClick={() => reject(id)} aria-label={`${t.grading.reject} ${name}`}>
                          {t.grading.reject}
                        </Button>
                      )}
                      {!pending && (
                        <Button
                          variant="ghost"
                          onClick={() => undo(id)}
                          aria-label={`${t.grading.undo} ${name}`}
                        >
                          {t.grading.undo}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
      <BottomBar>
        <Button variant="primary" className="flex-1" onClick={() => nav(`/doctor/case/${caseId}/simulate`)}>
          {t.grading.toSimulate}
        </Button>
      </BottomBar>
    </>
  );
}
