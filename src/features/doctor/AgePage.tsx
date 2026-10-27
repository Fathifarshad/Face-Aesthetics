import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { planSeverities } from '../../analysis/analyze';
import { AGE_BANDS, ageBandOf, type AgeBand } from '../../analysis/catalog';
import { CompareSlider } from '../../components/CompareSlider';
import { BottomBar, Button, Chip, Field, Header, Notice, Page, Section, Tag } from '../../components/ui';
import { audit, db, uid } from '../../db/db';
import { frontalPhoto, updateCase } from '../../db/repo';
import { useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { tierFromGap } from '../../plan/engine';
import { renderSimulation } from '../../simulation/render';
import { intensityFromGap } from '../../simulation/warp';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

/** Quick picks as target gaps. TODO(clinical): confirm; aligned with the tier boundaries in TREATMENTS.md §4. */
const PICKS = { natural: 3, refreshed: 8, maximum: 12 } as const;
const MAX_GAP = 15;
const BAND_UPPER: Record<AgeBand, number> = { '18-29': 29, '30-39': 39, '40-49': 49, '50-59': 59, '60+': 120 };

export function AgePage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const num = useNum();
  const nav = useNavigate();
  const data = useCase(caseId);
  const photo = useLive(() => frontalPhoto(caseId), [caseId]);
  const sim = useLive(async () => (await db.simulations.where('caseId').equals(caseId).sortBy('createdAt')).at(-1), [caseId]);
  const [strength, setStrength] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!data) return null;
  const { c, patient } = data;

  const minTarget = Math.max(18, c.actualAge - MAX_GAP);
  const setTarget = (age: number) => {
    const v = Math.min(c.actualAge, Math.max(minTarget, Math.round(age)));
    void updateCase(c.id, { targetAge: v, tier: tierFromGap(c.actualAge, v) }, 'age.target');
  };
  const tier = tierFromGap(c.actualAge, c.targetAge);
  const targetBand = ageBandOf(c.targetAge);

  const generate = async () => {
    if (!photo?.landmarks) return;
    setBusy(true);
    setMsg(null);
    try {
      const findings = await db.findings.where('caseId').equals(caseId).toArray();
      const bmp = await createImageBitmap(photo.blob);
      const intensity = Math.min(1.5, intensityFromGap(c.actualAge, c.targetAge) * strength);
      const blob = await renderSimulation(bmp, photo.landmarks, planSeverities(findings), intensity);
      bmp.close();
      await db.simulations.where('caseId').equals(caseId).delete();
      await db.simulations.add({ id: uid(), caseId, photoId: photo.id, targetAge: c.targetAge, strength, blob, createdAt: Date.now() });
      await audit(caseId, 'simulation.create', undefined, { targetAge: c.targetAge, strength });
      setMsg(t.age.simSaved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title={`${t.age.title} — ${patient.displayName}`} back={`/doctor/case/${caseId}/analysis`} />
      <Page>
        <CaseSteps caseId={c.id} />

        <Section title={t.age.band}>
          <div className="flex flex-wrap gap-2">
            {AGE_BANDS.map((b) => {
              const upper = Math.min(BAND_UPPER[b], c.actualAge);
              const lower = Number(b.slice(0, 2));
              const reachable = upper >= minTarget && lower <= c.actualAge;
              return (
                <Chip key={b} active={targetBand === b} onClick={() => reachable && setTarget(upper)} className={reachable ? '' : 'opacity-40'}>
                  <span dir="ltr">{b}</span>
                </Chip>
              );
            })}
          </div>
        </Section>

        <div className="card mb-5 grid grid-cols-2 gap-3">
          <Field label={t.age.actual}>
            <input
              className="w-full"
              inputMode="numeric"
              value={c.actualAge}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, '')) || 0;
                void updateCase(c.id, { actualAge: v, targetAge: Math.min(c.targetAge, v), tier: tierFromGap(v, Math.min(c.targetAge, v)) }, 'age.actual');
              }}
              dir="ltr"
            />
          </Field>
          <Field label={t.age.apparent}>
            <input
              className="w-full"
              inputMode="numeric"
              value={c.apparentAge ?? ''}
              onChange={(e) => void updateCase(c.id, { apparentAge: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null }, 'age.apparent')}
              dir="ltr"
            />
          </Field>
          <div className="col-span-2">
            <div className="flex items-baseline justify-between">
              <span className="label">{t.age.target}</span>
              <span className="gold-text text-[26px] font-bold">
                {num(c.targetAge)} <span className="text-[13px]">{t.age.years}</span>
              </span>
            </div>
            <input
              type="range"
              min={minTarget}
              max={c.actualAge}
              value={c.targetAge}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="w-full"
              aria-label={t.age.target}
              dir="ltr"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(PICKS) as (keyof typeof PICKS)[]).map((k) => (
                <Chip key={k} active={c.actualAge - c.targetAge === PICKS[k]} onClick={() => setTarget(c.actualAge - PICKS[k])}>
                  {t.age.picks[k]}
                </Chip>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[13px]">
              <span className="text-ink-secondary">{t.age.tierDefault}:</span>
              <Tag tone="gold">{t.plan.tiers[tier]}</Tag>
            </div>
          </div>
        </div>

        <Section title={t.age.afterSim}>
          {!photo?.landmarks ? (
            <Notice tone="warn">{t.age.noLandmarks}</Notice>
          ) : (
            <>
              <div className="card mb-3">
                <div className="flex items-center justify-between">
                  <span className="label">{t.age.strength}</span>
                  <span className="text-[13px] text-gold-ink">{num(Math.round(strength * 100))}%</span>
                </div>
                <input type="range" min={0.5} max={1.5} step={0.1} value={strength} onChange={(e) => setStrength(Number(e.target.value))} className="w-full" aria-label={t.age.strength} dir="ltr" />
                <Button variant="gold" className="mt-2 w-full" onClick={() => void generate()} disabled={busy || c.targetAge >= c.actualAge}>
                  <Sparkles size={18} /> {busy ? t.app.loading : t.age.simulate}
                </Button>
              </div>
              {sim && <CompareSlider left={photo.blob} right={sim.blob} leftLabel={t.age.before} rightLabel={`${t.age.afterSim} · ${num(sim.targetAge)}`} />}
              {msg && (
                <div className="mt-2">
                  <Notice tone="gold">{msg}</Notice>
                </div>
              )}
              <p className="mt-2 text-[12px] text-ink-tertiary">{t.age.simNote}</p>
            </>
          )}
        </Section>
      </Page>
      <BottomBar>
        <Button variant="gold" className="flex-1" onClick={() => nav(`/doctor/case/${caseId}/plan`)}>
          {t.age.toPlan}
        </Button>
      </BottomBar>
    </>
  );
}
