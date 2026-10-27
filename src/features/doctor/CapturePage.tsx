import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requiredViews } from '../../capture/services';
import { PHOTO_RULES, viewById } from '../../capture/views';
import { CaptureSlot } from '../../components/CaptureSlot';
import { BottomBar, Button, Header, Notice, Page } from '../../components/ui';
import { audit, db, uid } from '../../db/db';
import type { PhotoPhase } from '../../db/types';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import type { Processed } from '../../capture/processPhoto';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

export function CapturePage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const bi = useBi();
  const num = useNum();
  const nav = useNavigate();
  const data = useCase(caseId);
  const [phase, setPhase] = useState<PhotoPhase>('before');
  const [rules, setRules] = useState(false);
  const photos = useLive(() => db.photos.where('caseId').equals(caseId).toArray(), [caseId]);
  if (!data || !photos) return null;
  const { c, patient } = data;

  const views = requiredViews(c.services);
  const of = (ph: PhotoPhase, v: string) => photos.find((p) => p.phase === ph && p.view === v);
  const done = (ph: PhotoPhase) => views.filter((v) => of(ph, v)).length;
  const hasFrontal = !!of('before', 'frontal');

  const save = async (view: string, p: Processed, lowQuality: boolean) => {
    const prev = of(phase, view);
    await db.transaction('rw', [db.photos, db.findings, db.audit], async () => {
      if (prev) await db.photos.delete(prev.id);
      await db.photos.add({
        id: uid(),
        caseId,
        phase,
        view,
        blob: p.blob,
        width: p.width,
        height: p.height,
        landmarks: p.landmarks,
        pose: p.pose,
        qc: p.qc,
        lowQuality,
        source: 'doctor',
        takenAt: Date.now(),
      });
      // A new frontal "before" photo invalidates the computed analysis.
      if (phase === 'before' && view === 'frontal') await db.findings.where('caseId').equals(caseId).delete();
      await audit(caseId, 'photo.save', prev ? { id: prev.id } : undefined, { phase, view, lowQuality, qcPass: p.qc.pass });
    });
  };

  return (
    <>
      <Header title={`${t.capture.title} — ${patient.displayName}`} back={`/doctor/patient/${patient.id}`} />
      <Page>
        <CaseSteps caseId={c.id} />

        <div className="card mb-4">
          <button type="button" className="flex w-full items-center justify-between" onClick={() => setRules((r) => !r)} aria-expanded={rules}>
            <span className="font-semibold text-gold-ink">{t.capture.rules}</span>
            <ChevronDown size={18} className={rules ? 'rotate-180' : ''} />
          </button>
          {rules && (
            <ul className="mt-2 list-disc ps-5 text-[13px] text-ink-secondary">
              {PHOTO_RULES.map((r) => (
                <li key={r.en}>{bi(r)}</li>
              ))}
            </ul>
          )}
        </div>

        <div role="tablist" className="mb-3 grid grid-cols-2 gap-2">
          {(['before', 'after'] as const).map((ph) => (
            <button
              key={ph}
              role="tab"
              type="button"
              aria-selected={phase === ph}
              onClick={() => setPhase(ph)}
              className={`min-h-touch rounded-lg border px-3 py-2 text-start ${phase === ph ? 'border-gold bg-gold-tint' : 'border-border bg-surface'}`}
            >
              <div className={`font-semibold ${phase === ph ? 'text-gold-ink' : ''}`}>{ph === 'before' ? t.capture.before : t.capture.after}</div>
              <div className="text-[12px] text-ink-secondary">{t.capture.required(num(done(ph)), num(views.length))}</div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-surface-2">
                <div className="h-full rounded bg-gold" style={{ width: `${(done(ph) / views.length) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {views.map((v) => {
            const def = viewById(v)!;
            const p = of(phase, v);
            return (
              <CaptureSlot
                key={`${phase}-${v}`}
                view={def}
                photo={p ? { blob: p.blob, lowQuality: p.lowQuality, qc: p.qc } : null}
                ghost={phase === 'after' ? of('before', v)?.blob : null}
                onSave={(proc, low) => save(v, proc, low)}
                defaultOpen={v === views.find((x) => !of(phase, x))}
              />
            );
          })}
        </div>
        {!hasFrontal && (
          <div className="mt-3">
            <Notice tone="warn">{t.capture.needFrontal}</Notice>
          </div>
        )}
      </Page>
      <BottomBar>
        {done('after') > 0 && (
          <Button onClick={() => nav(`/doctor/case/${c.id}/compare`)}>{t.report.compare}</Button>
        )}
        <Button variant="gold" className="flex-1" disabled={!hasFrontal} onClick={() => nav(`/doctor/case/${c.id}/analysis`)}>
          {t.capture.toAnalysis}
        </Button>
      </BottomBar>
    </>
  );
}
