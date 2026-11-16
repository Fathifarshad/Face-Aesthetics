import { AlertTriangle, Siren } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BottomBar, Button, Chip, Header, LinkButton, Notice, Page, Section, Tag } from '../../components/ui';
import { defaultOrder, sessionsOf, sortOptions, SORT_KEYS, SUPPORT_FROM_GRADE, type SortKey } from '../../data/optionSort';
import type { OpenRange, Range, TreatmentOption } from '../../data/treatmentOptions';
import { CONCERN_IDS, type ConcernId } from '../../data/types';
import { db } from '../../db/db';
import { updateCase } from '../../db/repo';
import { getSimState, listGrades, setOption } from '../../db/simRepo';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { TIERS, type Tier } from '../../plan/data/treatments';
import { tierFromGap } from '../../plan/engine';
import { CaseSteps } from './CaseSteps';
import { screen } from './optionScreening';
import { chosenOptions, midfaceGradeOf, usable } from './simDefaults';
import { useCase } from './useCase';

/** Concerns whose cheek-support option leads from midface grade 2 (PRD F5.6). */
const SUPPORTED: ReadonlySet<ConcernId> = new Set<ConcernId>(['tear-trough', 'nasolabial-fold']);

/**
 * Treatment plan (PRD F5, M6): for every confirmed concern its options from the knowledge base (PRD §6), sorted by
 * one of five criteria (F5.2). The chosen option is the one the simulation shows (F5.3). Contraindicated options
 * (v1 intake checks) cannot be chosen. Volumes, doses and cost per plan come in M7.
 */
export function PlanPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const num = useNum();
  const bi = useBi();
  const nav = useNavigate();
  const data = useCase(caseId);
  const grades = useLive(() => listGrades(caseId), [caseId]);
  const sim = useLive(() => getSimState(caseId), [caseId]);
  const planRow = useLive(async () => (await db.plans.get(caseId)) ?? null, [caseId]);
  const [sortKey, setSortKey] = useState<SortKey>('result');

  if (!data || !grades || !sim || planRow === undefined) return null;
  const { patient, c } = data;
  const tier: Tier = planRow?.tier ?? c.tier ?? tierFromGap(c.actualAge, c.targetAge);
  const allowed = (o: TreatmentOption) => screen(o, c.intake).blocks.length === 0;
  const concerns = CONCERN_IDS.filter((id) => grades.some((g) => g.concernId === id && usable(g) && g.grade >= 1));
  const chosen = chosenOptions(concerns, sim.options ?? {}, grades, allowed);
  const midface = midfaceGradeOf(grades);
  const picked = concerns.map((id) => chosen[id]).filter((o): o is TreatmentOption => !!o);
  const name = (o: TreatmentOption) => bi({ fa: o.nameFa, en: o.nameEn });

  const saveTier = (k: Tier) => {
    void db.plans.put({ caseId, tier: k, selections: planRow?.selections ?? {}, updatedAt: Date.now() });
    void updateCase(caseId, { tier: k }, 'plan.tier');
  };

  const days = (r: Range | null, zero: string) =>
    !r ? t.options.unknown : r.max === 0 ? zero : t.options.days(num(r.min), r.min === r.max ? null : num(r.max));
  const months = (r: OpenRange | null) =>
    !r ? t.options.unknown : t.options.months(num(r.min), r.max === null || r.max === r.min ? null : num(r.max), r.max === null);
  const base = (o: TreatmentOption) => {
    const b = o.base;
    if (!b) return t.options.unknown;
    // Volumes keep their decimal (0.3 mL); units and sessions are whole numbers.
    const n = (v: number) => num(v, Number.isInteger(v) ? 0 : 1);
    const amount = b.steps
      ? b.steps.map(n).join(` ${t.options.or} `)
      : b.min === b.max
        ? n(b.min)
        : t.options.range(n(b.min), n(b.max));
    return `${amount} ${t.options.units[b.unit]} ${b.perSide ? t.options.perSide : t.options.total}`;
  };

  return (
    <>
      <Header
        title={`${t.plan.title} — ${patient.displayName}`}
        back={`/doctor/case/${caseId}/simulate`}
        right={
          <Link to="/emergency" aria-label={t.app.emergency} className="flex h-11 w-11 items-center justify-center rounded-md border border-danger/50 text-danger">
            <Siren size={18} />
          </Link>
        }
      />
      <Page>
        <CaseSteps caseId={caseId} />
        <div className="mb-3 flex gap-2">
          {TIERS.map((k) => (
            <Chip key={k} active={tier === k} className="flex-1" onClick={() => saveTier(k)}>
              {t.plan.tiers[k]}
            </Chip>
          ))}
        </div>
        <LinkButton to={`/doctor/case/${caseId}/mdcodes`} variant="ghost" className="mb-4 w-full border-primary/50 text-primary-on-tint">
          {t.plan.mdcodes}
        </LinkButton>

        {c.intake.unrealistic_expectations_flag && (
          <div className="mb-2">
            <Notice tone="warn">{t.plan.expectations}</Notice>
          </div>
        )}
        {c.screening.bddPositive && (
          <div className="mb-2">
            <Notice tone="warn">{t.intake.bddBanner}</Notice>
          </div>
        )}

        {concerns.length === 0 ? (
          <Notice>{t.options.nothing}</Notice>
        ) : (
          <>
            <div className="mb-2 text-caption text-ink-2">{t.options.sortBy}</div>
            <div role="group" aria-label={t.options.sortBy} className="mb-3 flex flex-wrap gap-1.5">
              {SORT_KEYS.map((k) => (
                <Chip key={k} active={sortKey === k} onClick={() => setSortKey(k)}>
                  {t.options.sort[k]}
                </Chip>
              ))}
            </div>
            <p className="mb-3 text-caption text-muted">{t.options.draftNote}</p>

            <div className="flex flex-col gap-3">
              {concerns.map((id) => {
                const own = grades.filter((g) => g.concernId === id && usable(g));
                const list = sortOptions(defaultOrder(id, midface), sortKey);
                const current = chosen[id];
                return (
                  <article key={id} className="card" data-concern={id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 text-section font-bold text-primary-on-tint">{t.concerns[id]}</h3>
                      <Tag>{t.options.grade(own.map((g) => num(g.grade)).join(' · '))}</Tag>
                    </div>
                    {SUPPORTED.has(id) && midface >= SUPPORT_FROM_GRADE && (
                      <p className="mt-1 text-caption text-ink-2">{t.options.supportFirst}</p>
                    )}
                    <div role="radiogroup" aria-label={`${t.options.title}: ${t.concerns[id]}`} className="mt-3 flex flex-col gap-2">
                      {list.map((o) => {
                        const { blocks, flags } = screen(o, c.intake);
                        const on = current?.id === o.id;
                        return (
                          <div
                            key={o.id}
                            data-option={o.id}
                            className={`rounded-md border p-3 ${on ? 'border-primary bg-primary-tint/40' : 'border-border'} ${blocks.length ? 'opacity-60' : ''}`}
                          >
                            <button
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={t.options.choose(name(o), t.concerns[id])}
                              disabled={blocks.length > 0}
                              onClick={() => void setOption(caseId, id, o.id)}
                              className="flex min-h-touch w-full items-start gap-2 text-start"
                            >
                              <span
                                className={`mt-1 h-4 w-4 shrink-0 rounded-pill border-2 ${on ? 'border-primary bg-primary' : 'border-muted'}`}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold">{name(o)}</span>
                                <span className="mt-1 flex flex-wrap gap-1">
                                  <Tag tone="primary">{t.options.modality[o.modality]}</Tag>
                                  {o.risks.map((r) => (
                                    <Tag key={r} tone={r === 'vascular' ? 'danger' : 'warn'}>
                                      {t.options.risk[r]}
                                    </Tag>
                                  ))}
                                  {o.status === 'draft' && (
                                    <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">
                                      {t.options.unverified}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                              <dt className="text-muted">{t.options.base}</dt>
                              <dd className="text-ink-2">
                                <bdi>{base(o)}</bdi>
                                {o.base?.status === 'verified' && <span className="block text-[11px] text-muted">{t.options.labelDose}</span>}
                              </dd>
                              <dt className="text-muted">{t.options.onset}</dt>
                              <dd className="text-ink-2">
                                <bdi>{days(o.onsetDays, t.options.immediate)}</bdi>
                              </dd>
                              <dt className="text-muted">{t.options.duration}</dt>
                              <dd className="text-ink-2">
                                <bdi>{months(o.durationMonths)}</bdi>
                              </dd>
                              <dt className="text-muted">{t.options.downtime}</dt>
                              <dd className="text-ink-2">
                                <bdi>{days(o.downtimeDays, t.options.none)}</bdi>
                              </dd>
                              {o.mdCodes.length > 0 && (
                                <>
                                  <dt className="text-muted">{t.plan.mdcodes}</dt>
                                  <dd className="text-ink-2" dir="ltr">
                                    {o.mdCodes.join(', ')}
                                  </dd>
                                </>
                              )}
                              <dt className="text-muted">{t.options.capLabel}</dt>
                              <dd className="text-ink-2">
                                <bdi>{num(Math.round(o.fx.maxStrength * 100))}%</bdi>
                              </dd>
                            </dl>
                            {(blocks.length > 0 || flags.length > 0) && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {blocks.map((b) => (
                                  <Tag key={b} tone="danger">
                                    {t.options.blocked}: {t.plan.blocks[b]}
                                  </Tag>
                                ))}
                                {flags.map((f) => (
                                  <Tag key={f} tone="warn">
                                    <AlertTriangle size={12} /> {t.plan.flags[f]}
                                  </Tag>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>

            {picked.length > 0 && (
              <Section title={t.options.sessions}>
                <ol className="relative flex flex-col gap-3 border-s border-primary/40 ps-4">
                  {sessionsOf(picked).map((s, i) => (
                    <li key={s.stage} className="relative" data-stage={s.stage}>
                      <span className="absolute -start-[23px] top-1 h-3 w-3 rounded-full bg-primary" />
                      <div className="card">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{t.options.session(num(i + 1))}</span>
                          <Tag tone="primary">{t.options.stages[s.stage]}</Tag>
                        </div>
                        <ul className="mt-1 list-disc ps-5 text-[13px]">
                          {s.options.map((o) => (
                            <li key={o.id}>
                              {name(o)} · {t.concerns[o.concernId]}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </>
        )}
      </Page>
      <BottomBar>
        <LinkButton to={`/doctor/case/${caseId}/simulate`} variant="ghost" className="flex-1">
          {t.options.toSimulation}
        </LinkButton>
        <Button variant="primary" className="flex-1" onClick={() => nav(`/doctor/case/${caseId}/report`)}>
          {t.plan.toReport}
        </Button>
      </BottomBar>
    </>
  );
}
