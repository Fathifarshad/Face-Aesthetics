import { FileText, Images, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SignaturePad } from '../../components/SignaturePad';
import { Button, Header, LinkButton, Notice, Page, Section, Toggle } from '../../components/ui';
import { audit, db, getSettings } from '../../db/db';
import { updateCase } from '../../db/repo';
import type { ClinicSettings } from '../../db/types';
import { formatDate, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { buildPatientPackage, shareJson } from '../../share/exchange';
import { useApp } from '../../store/app';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

const ITEMS = ['findings', 'plan', 'contraindications', 'screening'] as const;

export function ReportPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const lang = useApp((s) => s.lang);
  const data = useCase(caseId);
  const signoff = useLive(async () => (await db.signoffs.get(caseId)) ?? null, [caseId]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [appendix, setAppendix] = useState(false);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);
  if (!data || signoff === undefined || !settings) return null;
  const { c, patient } = data;

  const ready = ITEMS.every((k) => checks[k]) && !!signature && !!settings.doctorName && !!settings.licence;

  const sign = async () => {
    if (!signature) return;
    await db.signoffs.put({ caseId, checklist: checks, signature, signedAt: Date.now(), doctorName: settings.doctorName, licence: settings.licence });
    await updateCase(caseId, { status: 'signed' }, 'case.sign');
    await audit(caseId, 'signoff');
  };

  return (
    <>
      <Header title={`${t.report.title} — ${patient.displayName}`} back={`/doctor/case/${caseId}/plan`} />
      <Page>
        <CaseSteps caseId={caseId} />
        {signoff ? (
          <Notice tone="gold">
            {t.report.signed} {formatDate(signoff.signedAt, lang)} — {signoff.doctorName}
          </Notice>
        ) : (
          <>
            <Section title={t.report.checklist}>
              <div className="card">
                {ITEMS.map((k) => (
                  <Toggle key={k} label={t.report.items[k]!} checked={!!checks[k]} onChange={(v) => setChecks((s) => ({ ...s, [k]: v }))} />
                ))}
              </div>
            </Section>
            <Section title={t.report.signature}>
              <SignaturePad onChange={setSignature} />
            </Section>
            {(!settings.doctorName || !settings.licence) && (
              <div className="mb-3">
                <Notice tone="warn">
                  {t.report.needSettings} <Link to="/settings" className="underline">{t.app.settings}</Link>
                </Notice>
              </div>
            )}
            <Button variant="gold" className="w-full" disabled={!ready} onClick={() => void sign()}>
              {t.report.sign}
            </Button>
          </>
        )}

        {signoff && (
          <div className="mt-4 flex flex-col gap-2">
            <Toggle label={t.report.appendix} checked={appendix} onChange={setAppendix} />
            <LinkButton to={`/doctor/case/${caseId}/print?lang=fa${appendix ? '&appendix=1' : ''}`}>
              <FileText size={18} /> {t.report.printFa}
            </LinkButton>
            <LinkButton to={`/doctor/case/${caseId}/print?lang=en${appendix ? '&appendix=1' : ''}`} variant="ghost">
              <FileText size={18} /> {t.report.printEn}
            </LinkButton>
            <LinkButton to={`/doctor/case/${caseId}/compare`} variant="ghost">
              <Images size={18} /> {t.report.compare}
            </LinkButton>
            {c.consents.patientApp && (
              <Button
                variant="soft"
                onClick={async () => {
                  await shareJson(await buildPatientPackage(patient.id), `tanasob-${patient.code}.json`);
                  setNote(t.report.exported);
                }}
              >
                <Share2 size={18} /> {t.patient.exportPkg}
              </Button>
            )}
            {note && <Notice tone="gold">{note}</Notice>}
          </div>
        )}
      </Page>
    </>
  );
}
