import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CATALOG } from '../../analysis/catalog';
import { viewById } from '../../capture/views';
import { Button } from '../../components/ui';
import { db, getSettings } from '../../db/db';
import type { ClinicSettings, FindingRow, Photo, PtCase, Simulation } from '../../db/types';
import { dictFor, formatDate, numberFormatter } from '../../i18n';
import { useLive, useObjectUrl } from '../../lib/hooks';
import { safeAccent } from '../../lib/color';
import { toPtCase } from '../../share/exchange';
import type { Lang } from '../../store/app';

export function PrintPage() {
  const { caseId = '' } = useParams();
  const [params] = useSearchParams();
  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'fa';
  const appendix = params.get('appendix') === '1';
  const t = dictFor(lang);
  const num = numberFormatter(lang);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [pt, setPt] = useState<PtCase | null | undefined>(undefined);
  useEffect(() => {
    void getSettings().then(setSettings);
    void toPtCase(caseId).then(setPt);
  }, [caseId]);
  const data = useLive(async () => {
    const c = await db.cases.get(caseId);
    const patient = c && (await db.patients.get(c.patientId));
    const photos = await db.photos.where({ caseId, phase: 'before' }).toArray();
    const sim = (await db.simulations.where('caseId').equals(caseId).sortBy('createdAt')).at(-1) ?? null;
    const signoff = await db.signoffs.get(caseId);
    const findings = await db.findings.where('caseId').equals(caseId).toArray();
    return c && patient ? { c, patient, photos, sim, signoff, findings } : null;
  }, [caseId]);

  if (!data || !settings || pt === undefined) return null;
  const { patient, photos, sim, signoff, findings } = data;
  const accent = safeAccent(settings.accent);
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const shown = photos.filter((p) => ['frontal', 'oblique-r', 'oblique-l', 'profile-r'].includes(p.view)).slice(0, 4);

  if (!signoff || !pt) return <div className="p-6 text-ink">{t.report.notSigned}</div>;

  return (
    <div dir={dir} lang={lang} className="min-h-screen bg-white text-[#15212B]">
      <div className="no-print sticky top-0 flex justify-center gap-2 bg-bg p-3">
        <Button variant="gold" onClick={() => window.print()}>
          <Printer size={18} /> {t.report.print}
        </Button>
        <Button onClick={() => history.back()}>{t.app.back}</Button>
      </div>
      <article className="mx-auto max-w-[190mm] p-6 text-[13px] leading-relaxed">
        <header className="flex items-start justify-between gap-4 border-b-2 pb-3" style={{ borderColor: accent }}>
          <div>
            <h1 className="text-[20px] font-bold" style={{ color: accent }}>
              {settings.clinicName || t.report.patientReport}
            </h1>
            <div className="text-[12px] text-[#52616B]">
              {[settings.clinicAddress, settings.clinicPhone].filter(Boolean).join(' · ')}
            </div>
          </div>
          {settings.logo && <img src={settings.logo} alt="" className="h-14 w-auto" />}
        </header>

        <section className="mt-3 grid grid-cols-2 gap-1 text-[12px]">
          <div>
            <b>{t.report.patient}:</b> {patient.displayName} <span dir="ltr">({patient.code})</span>
          </div>
          <div>
            <b>{t.report.date}:</b> {formatDate(signoff.signedAt, lang)}
          </div>
          <div>
            <b>{t.report.doctor}:</b> {signoff.doctorName} {settings.doctorTitle && `— ${settings.doctorTitle}`}
          </div>
          <div>
            <b>{t.settings.licence}:</b> <span dir="ltr">{signoff.licence}</span>
          </div>
        </section>

        <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
          {t.report.photos}
        </h2>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {shown.map((p) => (
            <PrintPhoto key={p.id} photo={p} label={viewById(p.view)?.label[lang] ?? p.view} />
          ))}
          {sim && <PrintSim sim={sim} label={`${t.client.simulation} · ${num(sim.targetAge)}`} />}
        </div>

        <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
          {t.report.findingsTitle}
        </h2>
        <ul className="mt-1 list-disc ps-5">
          {pt.findings.map((f) => (
            <li key={f.key}>
              <b>{f.label[lang]}</b> — {f.patient[lang]}
            </li>
          ))}
        </ul>

        <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
          {t.report.planTitle}
        </h2>
        <ol className="mt-1 flex flex-col gap-1">
          {pt.sessions.map((s) => (
            <li key={s.index}>
              <b>{t.plan.session(num(s.index + 1))}</b> ({t.plan.kinds[s.kind as keyof typeof t.plan.kinds]})
              {s.after && <span className="text-[#52616B]"> — {s.after[lang]}</span>}: {s.items.map((i) => i[lang]).join('، ')}
            </li>
          ))}
        </ol>

        {pt.aftercare.length > 0 && (
          <>
            <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
              {t.report.aftercareTitle}
            </h2>
            {pt.aftercare.map((a) => (
              <p key={a.modality} className="mt-1 whitespace-pre-line">
                <b>{t.plan.modality[a.modality]}:</b> {a.text}
              </p>
            ))}
          </>
        )}

        {appendix && <Appendix findings={findings} lang={lang} />}

        <p className="mt-5 rounded border border-[#DCE2E6] bg-[#F4F6F7] p-2 text-[11px] text-[#52616B]">{t.report.disclaimer}</p>

        <footer className="mt-4 flex items-end justify-between">
          <div className="text-[11px] text-[#52616B]">
            {settings.footer}
            <div>{t.report.preparedWith}</div>
          </div>
          <div className="text-center">
            <img src={signoff.signature} alt={t.report.signature} className="h-16" />
            <div className="text-[12px]">{signoff.doctorName}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

function PrintPhoto({ photo, label }: { photo: Photo; label: string }) {
  const url = useObjectUrl(photo.blob);
  return (
    <figure>
      {url && <img src={url} alt={label} className="aspect-[3/4] w-full rounded object-cover" />}
      <figcaption className="text-center text-[10px] text-[#52616B]">{label}</figcaption>
    </figure>
  );
}

function PrintSim({ sim, label }: { sim: Simulation; label: string }) {
  const url = useObjectUrl(sim.blob);
  return (
    <figure>
      {url && <img src={url} alt={label} className="aspect-[3/4] w-full rounded object-cover" />}
      <figcaption className="text-center text-[10px] text-[#52616B]">{label}</figcaption>
    </figure>
  );
}

function Appendix({ findings, lang }: { findings: FindingRow[]; lang: Lang }) {
  const t = dictFor(lang);
  const num = numberFormatter(lang);
  const rows = findings.filter((f) => f.status !== 'rejected' && (f.source === 'auto' || f.severity !== null));
  return (
    <section className="mt-4 break-before-page">
      <h2 className="text-[15px] font-bold">{t.report.technical}</h2>
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#F4F6F7]">
            <th className="border p-1 text-start">{t.analysis.title}</th>
            <th className="border p-1">{t.analysis.value}</th>
            <th className="border p-1">{t.analysis.reference}</th>
            <th className="border p-1">{t.analysis.severity}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td className="border p-1">{CATALOG[f.key]?.label[lang] ?? f.key}</td>
              <td className="border p-1 text-center" dir="ltr">
                {f.source === 'auto' ? (f.display ?? (f.value === null ? '—' : `${f.unit === 'mm' ? '≈ ' : ''}${num(f.value, f.unit ? 1 : 2)} ${f.unit}`)) : '—'}
              </td>
              <td className="border p-1 text-center" dir="ltr">
                {f.reference}
              </td>
              <td className="border p-1 text-center">{f.severity === null ? '—' : num(f.severity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-[#52616B]">{t.analysis.approxNote}</p>
    </section>
  );
}
