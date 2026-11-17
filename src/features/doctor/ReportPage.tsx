import { FileText, Images, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SignaturePad } from '../../components/SignaturePad';
import { Button, Header, LinkButton, Notice, Page, Section, Toggle } from '../../components/ui';
import { approvalOf, approvalStamp } from '../../db/approval';
import { audit, db, getSettings } from '../../db/db';
import { getSignoff, saveSignoff } from '../../db/images';
import { updateCase } from '../../db/repo';
import { setReportNote } from '../../db/simRepo';
import type { ClinicSettings } from '../../db/types';
import { formatDate, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { buildPatientPackage, shareJson } from '../../share/exchange';
import { packageFileName } from '../../share/format';
import { useApp } from '../../store/app';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

const ITEMS = ['findings', 'plan', 'contraindications', 'screening'] as const;

export function ReportPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const lang = useApp((s) => s.lang);
  const data = useCase(caseId);
  // Stamp first (Dexie reads only), the sign-off last: it decrypts, which ends Dexie's tracking of this query.
  const approval = useLive(async () => {
    const [stamp, planRow] = await Promise.all([approvalStamp(caseId), db.plans.get(caseId)]);
    const signoff = await getSignoff(caseId);
    return { stamp, signoff, savedNote: planRow?.reportNote ?? '' };
  }, [caseId]);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [appendix, setAppendix] = useState(false);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);
  // A stale approval no longer counts: the case goes back to «منتظر تأیید», which also unlocks the simulation page.
  const staleSigned = !!approval && !!data && data.c.status === 'signed' && approvalOf(approval.signoff, approval.stamp) === 'stale';
  useEffect(() => {
    if (staleSigned) void updateCase(caseId, { status: 'awaiting-signoff' }, 'case.approvalStale');
  }, [staleSigned, caseId]);
  if (!data || !approval || !settings) return null;
  const { c, patient } = data;
  const { signoff, stamp, savedNote } = approval;
  // PRD F9.2: a sign-off counts only for the content it approved; any later change needs a new signature.
  const state = approvalOf(signoff, stamp);
  const fresh = state === 'fresh';
  const noteText = noteDraft ?? savedNote;
  const saveNote = async () => {
    if (noteDraft !== null && noteDraft.trim() !== savedNote) await setReportNote(caseId, noteDraft.trim());
    setNoteDraft(null);
  };

  const ready = ITEMS.every((k) => checks[k]) && !!signature && !!settings.doctorName && !!settings.licence;

  const sign = async () => {
    if (!signature) return;
    await saveNote();
    const approved = await approvalStamp(caseId);
    await saveSignoff({
      caseId,
      checklist: checks,
      signature,
      signedAt: Date.now(),
      doctorName: settings.doctorName,
      licence: settings.licence,
      stamp: approved,
    });
    setChecks({});
    setSignature(null);
    await updateCase(caseId, { status: 'signed' }, 'case.sign');
    await audit(caseId, 'signoff');
  };

  return (
    <>
      <Header title={`${t.report.title} — ${patient.displayName}`} back={`/doctor/case/${caseId}/plan`} />
      <Page>
        <CaseSteps caseId={caseId} />
        <Section title={t.report.noteTitle}>
          <textarea
            rows={3}
            className="w-full"
            value={noteText}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => void saveNote()}
            aria-label={t.report.noteTitle}
            data-report-note
          />
          <p className="mt-1 text-caption text-muted">{t.report.noteHint}</p>
        </Section>
        {state === 'stale' && (
          <div className="mb-3" data-approval="stale">
            <Notice tone="warn">{t.report.stale}</Notice>
          </div>
        )}
        {fresh && signoff ? (
          <div data-approval="fresh">
            <Notice tone="primary">
              {t.report.signed} {formatDate(signoff.signedAt, lang)} — {signoff.doctorName}
            </Notice>
          </div>
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
                  {t.report.needSettings} <Link to="/admin" className="underline">{t.app.settings}</Link>
                </Notice>
              </div>
            )}
            <Button variant="primary" className="w-full" disabled={!ready} onClick={() => void sign()}>
              {t.report.sign}
            </Button>
          </>
        )}

        {fresh && (
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
                  await shareJson(await buildPatientPackage(patient.id), packageFileName(patient.code));
                  setNote(t.report.exported);
                }}
              >
                <Share2 size={18} /> {t.patient.exportPkg}
              </Button>
            )}
            {note && <Notice tone="primary">{note}</Notice>}
          </div>
        )}
      </Page>
    </>
  );
}
