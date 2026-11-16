import { AlertTriangle, Siren } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BottomBar, Button, Chip, Field, Header, LinkButton, Notice, Page, Section, Tag } from '../../components/ui';
import { defaultOrder, sessionsOf, sortOptions, SORT_KEYS, SUPPORT_FROM_GRADE, type SortKey } from '../../data/optionSort';
import type { OpenRange, Range, TreatmentOption } from '../../data/treatmentOptions';
import { CONCERN_IDS, type ConcernId } from '../../data/types';
import {
  costOf,
  estimateOption,
  planTotals,
  unitOf,
  type Estimate,
  type EstimateResult,
  type Sides,
  type ToxinBrand,
} from '../../data/estimates';
import { db, getSettings } from '../../db/db';
import { updateCase } from '../../db/repo';
import { getSimState, listGrades, setEstimateOverride, setOption, setToxinBrand } from '../../db/simRepo';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { TIERS, type Tier } from '../../plan/data/treatments';
import { tierFromGap } from '../../plan/engine';
import { CaseSteps } from './CaseSteps';
import { screen } from './optionScreening';
import { chosenOptions, effectiveSettings, midfaceGradeOf, usable } from './simDefaults';
import { useCase } from './useCase';

/** Concerns whose cheek-support option leads from midface grade 2 (PRD F5.6). */
const SUPPORTED: ReadonlySet<ConcernId> = new Set<ConcernId>(['tear-trough', 'nasolabial-fold']);

const BRANDS: readonly ToxinBrand[] = ['onabotulinumtoxinA', 'other'];
type Draft = { optionId: string; min: string; max: string; note: string; error: boolean };

/**
 * Treatment plan (PRD F5, M6): for every confirmed concern its options from the knowledge base (PRD §6), sorted by
 * one of five criteria (F5.2). The chosen option is the one the simulation shows (F5.3). Contraindicated options
 * (v1 intake checks) cannot be chosen. Each option shows its estimate for this
 * patient (PRD F7, M7): base × grade factor × the change's intensity in the simulation (mode-A sliders), its cost
 * from the clinic tariff, and the doctor's own estimate where entered. Totals count syringes and vials.
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
  const clinic = useLive(() => getSettings(), []);
  const [sortKey, setSortKey] = useState<SortKey>('result');
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!data || !grades || !sim || planRow === undefined || !clinic) return null;
  const { patient, c } = data;
  const tier: Tier = planRow?.tier ?? c.tier ?? tierFromGap(c.actualAge, c.targetAge);
  const allowed = (o: TreatmentOption) => screen(o, c.intake).blocks.length === 0;
  const concerns = CONCERN_IDS.filter((id) => grades.some((g) => g.concernId === id && usable(g) && g.grade >= 1));
  const chosen = chosenOptions(concerns, sim.options ?? {}, grades, allowed);
  const midface = midfaceGradeOf(grades);
  const picked = concerns.map((id) => chosen[id]).filter((o): o is TreatmentOption => !!o);
  const name = (o: TreatmentOption) => bi({ fa: o.nameFa, en: o.nameEn });

  // Estimates (PRD F7): each option at its concern's slider in the simulation, capped by the option's own cap.
  const tariff = clinic.tariff;
  const brand = planRow?.toxinBrand;
  const sliders = effectiveSettings(concerns, grades, c.actualAge, sim.target, sim.overrides);
  const sidesOf = (o: TreatmentOption): Sides => {
    const sl = sliders[o.concernId];
    const at = (v: number) => (sl?.on ? Math.min(v, o.fx.maxStrength) : 0);
    const own = grades.filter((g) => g.concernId === o.concernId && usable(g));
    const grade = (side: 'R' | 'L' | 'both') => own.find((g) => g.side === side)?.grade ?? 0;
    const right = at(sl?.value ?? 0);
    if (own.some((g) => g.side === 'both')) return { both: { grade: grade('both'), intensity: right } };
    const left = at(sl?.mirror ? (sl?.value ?? 0) : (sl?.left ?? 0));
    return { R: { grade: grade('R'), intensity: right }, L: { grade: grade('L'), intensity: left } };
  };
  const estimateOf = (o: TreatmentOption): EstimateResult => estimateOption(o, sidesOf(o), brand, planRow?.estOverrides?.[o.id]);
  const costMid = (o: TreatmentOption) => {
    const r = estimateOf(o);
    const cost = r.ok ? costOf(o, r.est, tariff) : null;
    return cost ? (cost.min + cost.max) / 2 : null;
  };
  const hasTariff =
    Object.values(tariff.filler).some((v) => !!v) || !!tariff.toxinUnit || !!tariff.thread || Object.values(tariff.session).some((v) => !!v);
  const anyToxin = concerns.some((id) => defaultOrder(id, midface).some((o) => o.modality === 'toxin'));
  const totals = planTotals(
    picked.map((o) => ({ option: o, result: estimateOf(o) })),
    tariff,
  );

  /** Volumes keep their decimal (0.3 mL); units and sessions are whole numbers. */
  const amount = (v: number) => num(v, Number.isInteger(v) ? 0 : 1);
  const span = (a: number, b: number) => (a === b ? amount(a) : t.options.range(amount(a), amount(b)));
  const money = (r: { min: number; max: number }) =>
    `${r.min === r.max ? num(r.min) : t.options.range(num(r.min), num(r.max))} ${tariff.currency}`;
  const estText = (e: Estimate) => {
    const unit = t.options.units[e.unit];
    const main = e.steps ? e.steps.map(amount).join(` ${t.options.or} `) : span(e.min, e.max);
    if (e.perSide && e.left) return `${t.est.right} ${main} · ${t.est.left} ${span(e.left.min, e.left.max)} ${unit}`;
    return `${main} ${unit} ${e.perSide ? t.options.perSide : t.options.total}`;
  };
  const openDraft = (o: TreatmentOption) => {
    const r = estimateOf(o);
    setDraft({
      optionId: o.id,
      min: r.ok ? String(r.est.min) : '',
      max: r.ok ? String(r.est.max) : '',
      note: r.ok ? (r.est.note ?? '') : '',
      error: false,
    });
  };
  /** F7.5: the doctor's own range, stored with «ویرایش پزشک». */
  const saveDraft = (o: TreatmentOption) => {
    if (!draft) return;
    const min = Number(draft.min.replace(',', '.'));
    const max = Number(draft.max.replace(',', '.'));
    if (!draft.min || !draft.max || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || min > max)
      return setDraft({ ...draft, error: true });
    const r = estimateOf(o);
    const perSide = r.ok ? r.est.perSide : (o.base?.perSide ?? false);
    const note = draft.note.trim();
    void setEstimateOverride(caseId, o.id, { min, max, unit: unitOf(o), perSide, ...(note ? { note } : {}) });
    setDraft(null);
  };

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
            {!hasTariff && <p className="mb-3 text-caption text-muted">{t.est.noTariff}</p>}

            {anyToxin && (
              <div className="card mb-3" data-brand={brand ?? 'unset'}>
                <div role="radiogroup" aria-label={t.est.brand} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-control font-semibold">{t.est.brand}</span>
                  {BRANDS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      role="radio"
                      aria-checked={brand === b}
                      onClick={() => void setToxinBrand(caseId, b)}
                      className={`min-h-touch rounded-pill border px-3 text-control ${
                        brand === b ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint' : 'border-border'
                      }`}
                    >
                      <bdi>{t.est.brands[b]}</bdi>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-caption text-ink-2">{t.est.brandAsk}</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {concerns.map((id) => {
                const own = grades.filter((g) => g.concernId === id && usable(g));
                const list = sortOptions(defaultOrder(id, midface), sortKey, costMid);
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
                        const est = estimateOf(o);
                        const cost = est.ok ? costOf(o, est.est, tariff) : null;
                        const editing = draft?.optionId === o.id;
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
                              <dt className="text-muted">{t.est.title}</dt>
                              <dd className="text-ink-2" data-estimate={est.ok ? `${est.est.min}-${est.est.max}` : est.missing}>
                                {est.ok ? <bdi>{estText(est.est)}</bdi> : <span className="text-risk-fg">{t.est.missing[est.missing]}</span>}
                                {est.ok && est.est.overridden && (
                                  <span className="ms-1 inline-flex rounded-md bg-primary-tint px-1.5 text-[11px] text-primary-on-tint">
                                    {t.est.edited}
                                  </span>
                                )}
                                {est.ok && est.est.note && <span className="block text-[11px] text-muted">{est.est.note}</span>}
                              </dd>
                              <dt className="text-muted">{t.est.cost}</dt>
                              <dd className="text-ink-2" data-cost={cost ? `${cost.min}-${cost.max}` : 'tier'}>
                                <bdi>{cost ? money(cost) : t.est.costTier(num(o.costTier))}</bdi>
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
                            {on && !editing && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button onClick={() => openDraft(o)} aria-label={`${t.est.edit}: ${name(o)}`}>
                                  {t.est.edit}
                                </Button>
                                {est.ok && est.est.overridden && (
                                  <Button variant="ghost" onClick={() => void setEstimateOverride(caseId, o.id, null)}>
                                    {t.est.clear}
                                  </Button>
                                )}
                              </div>
                            )}
                            {editing && draft && (
                              <form
                                className="mt-2 grid grid-cols-2 gap-2"
                                data-override-form={o.id}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  saveDraft(o);
                                }}
                              >
                                <Field label={`${t.est.min} (${t.options.units[unitOf(o)]})`}>
                                  <input
                                    className="w-full"
                                    inputMode="decimal"
                                    dir="ltr"
                                    value={draft.min}
                                    onChange={(e) => setDraft({ ...draft, min: e.target.value, error: false })}
                                  />
                                </Field>
                                <Field label={`${t.est.max} (${t.options.units[unitOf(o)]})`}>
                                  <input
                                    className="w-full"
                                    inputMode="decimal"
                                    dir="ltr"
                                    value={draft.max}
                                    onChange={(e) => setDraft({ ...draft, max: e.target.value, error: false })}
                                  />
                                </Field>
                                <div className="col-span-2">
                                  <Field label={t.est.note}>
                                    <input className="w-full" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                                  </Field>
                                </div>
                                {draft.error && (
                                  <div className="col-span-2">
                                    <Notice tone="danger">{t.est.invalid}</Notice>
                                  </div>
                                )}
                                <Button type="submit" variant="primary">
                                  {t.est.save}
                                </Button>
                                <Button variant="ghost" onClick={() => setDraft(null)}>
                                  {t.est.cancel}
                                </Button>
                              </form>
                            )}
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
              <Section title={t.est.totals}>
                <div className="card" data-totals>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-control">
                    <dt className="text-muted">{t.est.filler}</dt>
                    <dd data-total="filler">
                      <bdi>
                        {span(totals.fillerMl.min, totals.fillerMl.max)} mL · {t.est.syringes(span(totals.syringes.min, totals.syringes.max))}
                      </bdi>
                    </dd>
                    <dt className="text-muted">{t.est.toxin}</dt>
                    <dd data-total="toxin">
                      <bdi>
                        {span(totals.toxinU.min, totals.toxinU.max)} U · {t.est.vials(span(totals.vials.min, totals.vials.max))}
                      </bdi>
                    </dd>
                    {totals.threads.max > 0 && (
                      <>
                        <dt className="text-muted">{t.est.threads}</dt>
                        <dd>
                          <bdi>{span(totals.threads.min, totals.threads.max)}</bdi>
                        </dd>
                      </>
                    )}
                    {totals.sessions.max > 0 && (
                      <>
                        <dt className="text-muted">{t.est.sessions}</dt>
                        <dd>
                          <bdi>{span(totals.sessions.min, totals.sessions.max)}</bdi>
                        </dd>
                      </>
                    )}
                    {hasTariff && (
                      <>
                        <dt className="text-muted">{t.est.cost}</dt>
                        <dd data-total="cost">
                          <bdi>{money(totals.cost)}</bdi>
                        </dd>
                      </>
                    )}
                  </dl>
                  {totals.noEstimate > 0 && <p className="mt-2 text-caption text-risk-fg">{t.est.noEstimate(num(totals.noEstimate))}</p>}
                  {hasTariff && totals.costMissing > 0 && (
                    <p className="mt-1 text-caption text-muted">{t.est.costMissing(num(totals.costMissing))}</p>
                  )}
                  <p className="mt-2 text-caption text-muted">
                    <span className="me-1.5 inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">
                      {t.options.unverified}
                    </span>
                    {t.est.formula}
                  </p>
                </div>
              </Section>
            )}

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
