import { useNavigate, useParams } from 'react-router-dom';
import { BottomBar, Button, Chip, Header, Notice, Page, Section, Toggle } from '../../components/ui';
import { updateCase } from '../../db/repo';
import type { Case } from '../../db/types';
import { AREA_LABEL } from '../../plan/data/areas';
import { AREAS } from '../../plan/data/treatments';
import { AREA_INTAKE_KEYS, BOOLEAN_INTAKE_KEYS } from '../../plan/intake';
import { useT } from '../../i18n';
import { useApp } from '../../store/app';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

export function IntakePage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const lang = useApp((s) => s.lang);
  const nav = useNavigate();
  const data = useCase(caseId);
  if (!data) return null;
  const { c, patient } = data;
  const set = (patch: (cur: Case) => Partial<Case>) => void updateCase(c.id, patch, 'intake.update');
  const setIntake = (patch: Partial<Case['intake']>) => set((cur) => ({ intake: { ...cur.intake, ...patch } }));
  const consentOk = c.consents.photography && c.consents.analysis && c.consents.storage;
  const under18 = c.actualAge < 18;

  return (
    <>
      <Header title={`${t.intake.title} — ${patient.displayName}`} back={`/doctor/patient/${patient.id}`} />
      <Page>
        <CaseSteps caseId={c.id} />
        {under18 && <Notice tone="danger">{t.patient.under18}</Notice>}

        <Section title={t.intake.medical}>
          <div className="card">
            {BOOLEAN_INTAKE_KEYS.map((k) => (
              <Toggle key={k} label={t.intake.q[k]} checked={c.intake[k]} onChange={(v) => setIntake({ [k]: v })} />
            ))}
          </div>
        </Section>

        {AREA_INTAKE_KEYS.map((k) => (
          <Section key={k} title={t.intake.areas[k]}>
            <div className="flex flex-wrap gap-2">
              {AREAS.map((a) => (
                <Chip
                  key={a}
                  active={c.intake[k].includes(a)}
                  onClick={() =>
                    set((cur) => {
                      const list = cur.intake[k];
                      return { intake: { ...cur.intake, [k]: list.includes(a) ? list.filter((x) => x !== a) : [...list, a] } };
                    })
                  }
                >
                  {AREA_LABEL[a][lang]}
                </Chip>
              ))}
            </div>
          </Section>
        ))}

        <Section title={t.intake.fitzpatrick}>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} active={c.intake.fitzpatrick === n} onClick={() => set((cur) => ({ intake: { ...cur.intake, fitzpatrick: cur.intake.fitzpatrick === n ? null : n } }))}>
                {['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1]}
              </Chip>
            ))}
          </div>
        </Section>
        <Section title={t.intake.glogau}>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((n) => (
              <Chip key={n} active={c.glogau === n} onClick={() => set((cur) => ({ glogau: cur.glogau === n ? null : n }))}>
                {['I', 'II', 'III', 'IV'][n - 1]}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title={t.intake.consents}>
          <div className="card">
            {(['photography', 'analysis', 'storage', 'educational', 'patientApp'] as const).map((k) => (
              <Toggle key={k} label={t.intake.consent[k]} checked={c.consents[k]} onChange={(v) => set((cur) => ({ consents: { ...cur.consents, [k]: v } }))} />
            ))}
          </div>
          {!consentOk && (
            <div className="mt-2">
              <Notice tone="warn">{t.intake.consentRequired}</Notice>
            </div>
          )}
        </Section>

        <Section title={t.intake.bdd}>
          <p className="mb-2 text-[13px] text-ink-secondary">{t.intake.bddNote}</p>
          <div className="flex gap-2">
            <Chip active={c.screening.bddPositive === false} onClick={() => set((cur) => ({ screening: { ...cur.screening, bddPositive: false } }))}>
              {t.intake.bddNegative}
            </Chip>
            <Chip active={c.screening.bddPositive === true} onClick={() => set((cur) => ({ screening: { ...cur.screening, bddPositive: true } }))}>
              {t.intake.bddPositive}
            </Chip>
          </div>
          {c.screening.bddPositive && (
            <div className="mt-2">
              <Notice tone="warn">{t.intake.bddBanner}</Notice>
            </div>
          )}
        </Section>
      </Page>
      <BottomBar>
        <Button variant="gold" className="flex-1" disabled={!consentOk || under18} onClick={() => nav(`/doctor/case/${c.id}/capture`)}>
          {t.capture.title}
        </Button>
      </BottomBar>
    </>
  );
}
