import { AlertTriangle, CheckSquare, ChevronDown, Siren, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { planSeverities } from '../../analysis/analyze';
import { CATALOG } from '../../analysis/catalog';
import { BottomBar, Button, Chip, Header, LinkButton, Notice, Page, Section, SeverityDots, Tag } from '../../components/ui';
import { db, getSettings } from '../../db/db';
import { updateCase } from '../../db/repo';
import type { ClinicSettings } from '../../db/types';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { TIERS, optionById, type Tier, type TreatmentOption } from '../../plan/data/treatments';
import { buildSessions, costEstimate, defaultSelection, planFindings, tierFromGap, type FindingPlan } from '../../plan/engine';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

const STAGE_RANK: Record<TreatmentOption['stage'], number> = { toxin: 0, energy: 1, structure: 2, biostim: 3, detail: 4, booster: 5, lipolysis: 5 };

export function PlanPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const bi = useBi();
  const num = useNum();
  const nav = useNavigate();
  const data = useCase(caseId);
  const findings = useLive(() => db.findings.where('caseId').equals(caseId).toArray(), [caseId]);
  const planRow = useLive(async () => (await db.plans.get(caseId)) ?? null, [caseId]);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  const c = data?.c;
  const tier: Tier = planRow?.tier ?? c?.tier ?? (c ? tierFromGap(c.actualAge, c.targetAge) : 'minimal');
  const plans = useMemo(
    () => (c && findings ? planFindings(planSeverities(findings), tier, c.intake, c.targetAge) : []),
    [c, findings, tier],
  );

  useEffect(() => {
    if (planRow === null && plans.length && c) {
      void db.plans.put({ caseId, tier, selections: defaultSelection(plans), updatedAt: Date.now() });
    }
  }, [planRow, plans, c, caseId, tier]);

  if (!data || !findings || planRow === undefined || !settings) return null;
  const { patient } = data;
  const selections = planRow?.selections ?? {};
  const selectedIds = plans.flatMap((p) => (selections[p.findingKey] ?? []).filter((id) => p.options.some((o) => o.option.id === id)));
  const { sessions, warnings } = buildSessions(selectedIds, settings.maxHighRiskPerSession);
  const cost = costEstimate(selectedIds, settings.prices);

  const save = (patch: { tier?: Tier; selections?: Record<string, string[]> }) =>
    db.plans.put({ caseId, tier: patch.tier ?? tier, selections: patch.selections ?? selections, updatedAt: Date.now() });

  const toggle = (findingKey: string, id: string) =>
    void db.transaction('rw', db.plans, async () => {
      const row = await db.plans.get(caseId);
      const sel = row?.selections ?? {};
      const cur = sel[findingKey] ?? [];
      await db.plans.put({
        caseId,
        tier: row?.tier ?? tier,
        selections: { ...sel, [findingKey]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] },
        updatedAt: Date.now(),
      });
    });

  return (
    <>
      <Header
        title={`${t.plan.title} — ${patient.displayName}`}
        back={`/doctor/case/${caseId}/age`}
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
            <Chip
              key={k}
              active={tier === k}
              className="flex-1"
              onClick={() => {
                void save({ tier: k });
                void updateCase(caseId, { tier: k }, 'plan.tier');
              }}
            >
              {t.plan.tiers[k]}
            </Chip>
          ))}
        </div>
        <LinkButton to={`/doctor/case/${caseId}/mdcodes`} variant="ghost" className="mb-4 w-full border-gold/50 text-gold-ink">
          {t.plan.mdcodes}
        </LinkButton>

        {data.c.intake.unrealistic_expectations_flag && (
          <div className="mb-2">
            <Notice tone="warn">{t.plan.expectations}</Notice>
          </div>
        )}
        {data.c.screening.bddPositive && (
          <div className="mb-2">
            <Notice tone="warn">{t.intake.bddBanner}</Notice>
          </div>
        )}
        {plans.length === 0 && <Notice>{t.plan.nothing}</Notice>}

        <div className="flex flex-col gap-3">
          {plans.map((p, i) => (
            <FindingPlanCard key={p.findingKey} plan={p} defaultOpen={i < 2} selected={selections[p.findingKey] ?? []} onToggle={(id) => toggle(p.findingKey, id)} />
          ))}
        </div>

        {sessions.length > 0 && (
          <Section title={t.plan.sessions}>
            <ol className="relative flex flex-col gap-3 border-s border-gold/40 ps-4">
              {sessions.map((s) => (
                <li key={s.index} className="relative">
                  <span className="absolute -start-[23px] top-1 h-3 w-3 rounded-full bg-gold" />
                  <div className="card">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.plan.session(num(s.index + 1))}</span>
                      <Tag tone="gold">{t.plan.kinds[s.kind]}</Tag>
                    </div>
                    {s.after && <div className="text-[12px] text-ink-secondary">{t.plan.interval}: {bi(s.after)}</div>}
                    <SessionItems ids={s.optionIds} />
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {warnings.map((w) => (
              <Notice key={w.code} tone="warn">
                <AlertTriangle size={14} className="me-1 inline" /> {t.plan.warnings[w.code]}
              </Notice>
            ))}
          </div>
        )}

        {selectedIds.length > 0 && (
          <Section title={t.plan.cost}>
            <div className="card">
              <div className="gold-text text-[22px] font-bold">{num(cost.total)}</div>
              {cost.missing.length > 0 && <p className="text-[12px] text-ink-secondary">{t.plan.missingPrice}</p>}
            </div>
          </Section>
        )}
      </Page>
      <BottomBar>
        <Button variant="gold" className="flex-1" onClick={() => nav(`/doctor/case/${caseId}/report`)}>
          {t.plan.toReport}
        </Button>
      </BottomBar>
    </>
  );
}

function SessionItems({ ids }: { ids: string[] }) {
  const bi = useBi();
  return (
    <ul className="mt-1 list-disc ps-5 text-[13px]">
      {ids.map((id) => (
        <li key={id}>{bi(optionById(id)!.title)}</li>
      ))}
    </ul>
  );
}

function FindingPlanCard({
  plan,
  selected,
  onToggle,
  defaultOpen,
}: {
  plan: FindingPlan;
  selected: string[];
  onToggle: (id: string) => void;
  defaultOpen: boolean;
}) {
  const t = useT();
  const bi = useBi();
  const num = useNum();
  const [open, setOpen] = useState(defaultOpen);
  const [showBlocked, setShowBlocked] = useState(false);
  const cat = CATALOG[plan.findingKey];
  const combo = plan.options
    .filter((o) => selected.includes(o.option.id))
    .sort((a, b) => STAGE_RANK[a.option.stage] - STAGE_RANK[b.option.stage]);

  return (
    <article className="card">
      <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-gold-ink">{cat ? bi(cat.label) : plan.findingKey}</h3>
          <div className="mt-1 flex items-center gap-2">
            <SeverityDots value={plan.severity} label={t.analysis.of4(num(plan.severity))} />
            <span className="text-[12px] text-ink-secondary">
              {t.plan.priority} {num(plan.priority, 2)}
            </span>
          </div>
        </div>
        <ChevronDown size={18} className={open ? 'rotate-180' : ''} />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {cat && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md bg-surface-2 p-2.5">
                <div className="text-[12px] font-semibold text-ink-secondary">{t.plan.about}</div>
                <p className="text-[13px]">{bi(cat.about)}</p>
              </div>
              <div className="rounded-md bg-surface-2 p-2.5">
                <div className="text-[12px] font-semibold text-ink-secondary">{t.plan.patientWording}</div>
                <p className="text-[13px]">{bi(cat.patient)}</p>
              </div>
            </div>
          )}

          <div className="text-[13px] font-semibold">{t.plan.options}</div>
          {plan.options.map(({ option: o, flags }) => {
            const on = selected.includes(o.id);
            return (
              <div key={o.id} className={`rounded-lg border p-3 ${on ? 'border-gold bg-gold-tint/40' : 'border-border'}`}>
                <button type="button" className="flex w-full items-start gap-2 text-start" onClick={() => onToggle(o.id)} aria-pressed={on}>
                  {on ? <CheckSquare size={20} className="mt-0.5 shrink-0 text-gold" /> : <Square size={20} className="mt-0.5 shrink-0 text-ink-tertiary" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{bi(o.title)}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Tag tone="gold">{t.plan.modality[o.modality]}</Tag>
                      <Tag>{t.plan.tiers[o.minTier]}</Tag>
                      {o.riskTags.map((r) => (
                        <Tag key={r} tone={r === 'high-risk-vascular' ? 'danger' : 'warn'}>
                          {t.plan.risk[r]}
                        </Tag>
                      ))}
                    </span>
                  </span>
                </button>
                <div className="mt-2 text-[13px]">
                  <span className="text-ink-tertiary">{t.plan.how}: </span>
                  {bi(o.how)}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                  <Detail k={t.plan.product} v={o.productClass} />
                  {o.layer && <Detail k={t.plan.layer} v={o.layer} />}
                  {o.tool && <Detail k={t.plan.tool} v={t.plan.tools[o.tool] ?? o.tool} />}
                  <Detail k={t.plan.sessionsLabel} v={o.sessions ? bi(o.sessions) : t.app.perClinician} />
                  {o.interval && <Detail k={t.plan.interval} v={bi(o.interval)} />}
                  <Detail k={t.plan.volume} v={o.volumeOrUnits ?? t.app.perClinician} />
                  <Detail k={t.plan.evidence} v={o.evidence ?? 'TODO(clinical)'} />
                  <Detail k={t.plan.sources} v={o.sources.length ? o.sources.join(', ') : o.id} />
                </dl>
                {!o.reviewedBy && <p className="mt-1 text-[11px] text-ink-tertiary">{t.app.notReviewed}</p>}
                {flags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
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

          {combo.length > 1 && (
            <div className="rounded-md border border-gold/40 p-3">
              <div className="text-[13px] font-semibold text-gold-ink">{t.plan.combo}</div>
              <ol className="mt-1 list-decimal ps-5 text-[13px]">
                {combo.map(({ option }) => (
                  <li key={option.id}>{bi(option.title)}</li>
                ))}
              </ol>
              <p className="mt-1 text-[11px] text-ink-tertiary">{t.plan.comboNote}</p>
            </div>
          )}

          {plan.blocked.length > 0 && (
            <div>
              <button type="button" className="min-h-touch text-[12px] text-danger underline" onClick={() => setShowBlocked((s) => !s)}>
                {t.plan.blocked} ({num(plan.blocked.length)})
              </button>
              {showBlocked && (
                <ul className="mt-1 text-[12px] text-ink-secondary">
                  {plan.blocked.map((b) => (
                    <li key={b.option.id}>
                      {bi(b.option.title)} — {b.reasons.map((r) => t.plan.blocks[r]).join('، ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-ink-tertiary">{k}</dt>
      <dd className="text-ink-secondary">{v}</dd>
    </>
  );
}
