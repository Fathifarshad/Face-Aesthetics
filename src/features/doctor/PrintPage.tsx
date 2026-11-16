import { Printer } from 'lucide-react';
import { canShare } from '../../data/consentGate';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CATALOG } from '../../analysis/catalog';
import { viewById } from '../../capture/views';
import { Button } from '../../components/ui';
import { approvalOf, approvalStamp } from '../../db/approval';
import { db, getSettings } from '../../db/db';
import { getSimState, listGrades } from '../../db/simRepo';
import { getSignoff, latestSimulation, listPhotos } from '../../db/images';
import type { ClinicSettings, FindingRow, Photo, PtCase, Simulation } from '../../db/types';
import { dictFor, formatDate, numberFormatter } from '../../i18n';
import { useLive, useObjectUrl } from '../../lib/hooks';
import { safeAccent } from '../../lib/color';
import { toPtCase } from '../../share/exchange';
import { costOf, type Tariff } from '../../data/estimates';
import type { Dict } from '../../i18n/fa';
import { estimateFormat, planView, type PlanView } from './planEstimates';
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
    const findings = await db.findings.where('caseId').equals(caseId).toArray();
    const consents = c ? await db.consents.where('patientId').equals(c.patientId).toArray() : [];
    const [grades, simState, planRow, stamp] = await Promise.all([listGrades(caseId), getSimState(caseId), db.plans.get(caseId), approvalStamp(caseId)]);
    // Image reads last and together: they decrypt, which ends Dexie's tracking of this query.
    const [photos, sim, signoff] = await Promise.all([listPhotos(caseId, 'before'), latestSimulation(caseId), getSignoff(caseId)]);
    if (!c || !patient) return null;
    const approved = approvalOf(signoff, stamp) === 'fresh';
    return { c, patient, photos, sim, signoff, approved, findings, grades, simState, planRow, photosAllowed: canShare(consents, 'patient') };
  }, [caseId]);

  if (!data || !settings || pt === undefined) return null;
  const { c, patient, photos, sim, signoff, approved, findings, grades, simState, planRow, photosAllowed } = data;
  const accent = safeAccent(settings.accent);
  const dir = lang === 'fa' ? 'rtl' : 'ltr';
  const shown = photos.filter((p) => ['frontal', 'oblique-r', 'oblique-l', 'profile-r'].includes(p.view)).slice(0, 4);

  // PRD F9.2: no report without the doctor's approval of exactly this content.
  if (!signoff || !pt || !approved)
    return (
      <div className="p-6 text-ink" data-report-blocked>
        {signoff ? t.report.stale : t.report.notSigned}
      </div>
    );
  const tariff = settings.tariff;
  const plan = planView({ c, grades, sim: simState, planRow, tariff });
  const fmt = estimateFormat(t, num, tariff.currency);
  const note = planRow?.reportNote?.trim() ?? '';

  return (
    <div dir={dir} lang={lang} className="min-h-screen bg-paper text-paper-ink">
      <div className="no-print sticky top-0 flex justify-center gap-2 bg-bg p-3">
        <Button variant="primary" onClick={() => window.print()}>
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
            <div className="text-[12px] text-paper-muted">
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
        {photosAllowed ? (
          <>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {shown.map((p) => (
                <PrintPhoto key={p.id} photo={p} label={viewById(p.view)?.label[lang] ?? p.view} />
              ))}
              {sim && <PrintSim sim={sim} label={`${t.client.simulation} · ${num(sim.targetAge)}`} />}
            </div>
            {!sim && (
              <p className="mt-2 text-[12px]" data-no-simulation>
                {t.report.noSimulation}
              </p>
            )}
          </>
        ) : (
          // PRD F8.4: without level-3 consent the report carries no photo.
          <p className="mt-2 text-[12px]" data-photos-withheld>
            {t.consent.level3None}
          </p>
        )}

        <ItemsTable plan={plan} fmt={fmt} tariff={tariff} t={t} lang={lang} accent={accent} />

        {note && (
          <>
            <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
              {t.report.noteTitle}
            </h2>
            <p className="mt-1 whitespace-pre-line" data-report-note>
              {note}
            </p>
          </>
        )}

        {/* v1 analysis findings; the PRD 2.0 concerns are the rows of the items table above. */}
        {pt.findings.length > 0 && (
          <>
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
          </>
        )}

        <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
          {t.report.planTitle}
        </h2>
        <ol className="mt-1 flex flex-col gap-1">
          {pt.sessions.map((s) => (
            <li key={s.index}>
              <b>{t.plan.session(num(s.index + 1))}</b> ({t.plan.kinds[s.kind as keyof typeof t.plan.kinds]})
              {s.after && <span className="text-paper-muted"> — {s.after[lang]}</span>}: {s.items.map((i) => i[lang]).join('، ')}
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

        <p className="mt-5 rounded border border-paper-border bg-paper-2 p-2 text-[11px] text-paper-muted">{t.report.disclaimer}</p>

        <footer className="mt-4 flex items-end justify-between">
          <div className="text-[11px] text-paper-muted">
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
      {url && <img src={url} alt={label} className="aspect-[3/4] w-full rounded bg-paper-2 object-contain" />}
      <figcaption className="text-center text-[10px] text-paper-muted">{label}</figcaption>
    </figure>
  );
}

function PrintSim({ sim, label }: { sim: Simulation; label: string }) {
  const url = useObjectUrl(sim.blob);
  return (
    <figure>
      {url && <img src={url} alt={label} data-sim-image className="aspect-[3/4] w-full rounded bg-paper-2 object-contain" />}
      <figcaption className="text-center text-[10px] text-paper-muted">{label}</figcaption>
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
          <tr className="bg-paper-2">
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
      <p className="mt-1 text-[10px] text-paper-muted">{t.analysis.approxNote}</p>
    </section>
  );
}

/**
 * PRD F9.1 line items: area, chosen option, MD Codes, volume or dose range, cost. The same numbers as the plan page
 * (`planView`); drafts carry the «تأییدنشده» tag, the doctor's own estimates «ویرایش پزشک». No cost column without a tariff.
 */
function ItemsTable({
  plan,
  fmt,
  tariff,
  t,
  lang,
  accent,
}: {
  plan: PlanView;
  fmt: ReturnType<typeof estimateFormat>;
  tariff: Tariff;
  t: Dict;
  lang: Lang;
  accent: string;
}) {
  const { picked, estimateOf, totals, hasTariff } = plan;
  const { span, money, estText } = fmt;
  const rows = picked.map((o) => {
    const r = estimateOf(o);
    return { o, r, cost: r.ok ? costOf(o, r.est, tariff) : null };
  });
  const anyDraft = rows.some(({ r }) => r.ok && r.est.status === 'draft' && !r.est.overridden);
  const cell = 'border border-paper-border p-1';
  return (
    <>
      <h2 className="mt-4 text-[15px] font-bold" style={{ color: accent }}>
        {t.report.itemsTitle}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px]">{t.report.noItems}</p>
      ) : (
        <table className="mt-1 w-full border-collapse text-[11.5px]" data-report-items>
          <thead>
            <tr className="bg-paper-2">
              <th className={`${cell} text-start`}>{t.report.cols.area}</th>
              <th className={`${cell} text-start`}>{t.report.cols.option}</th>
              <th className={`${cell} text-start`}>{t.report.cols.codes}</th>
              <th className={`${cell} text-start`}>{t.report.cols.amount}</th>
              {hasTariff && <th className={`${cell} text-start`}>{t.report.cols.cost}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, r, cost }) => (
              <tr key={o.id} data-item={o.id}>
                <td className={cell}>{t.concerns[o.concernId]}</td>
                <td className={cell}>{lang === 'fa' ? o.nameFa : o.nameEn}</td>
                <td className={cell}>
                  <bdi dir="ltr">{o.mdCodes.length ? o.mdCodes.join(', ') : '—'}</bdi>
                </td>
                <td className={cell} data-amount={r.ok ? `${r.est.min}-${r.est.max}` : r.missing}>
                  {r.ok ? (
                    <>
                      <bdi>{estText(r.est)}</bdi>
                      {r.est.overridden ? (
                        <span className="ms-1 text-paper-muted">({t.est.edited})</span>
                      ) : (
                        r.est.status === 'draft' && (
                          <span className="ms-1 text-paper-muted" data-draft>
                            ({t.options.unverified})
                          </span>
                        )
                      )}
                    </>
                  ) : (
                    t.est.missing[r.missing]
                  )}
                </td>
                {hasTariff && (
                  <td className={cell} data-cost={cost ? `${cost.min}-${cost.max}` : 'none'}>
                    <bdi>{cost ? money(cost) : '—'}</bdi>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={cell} colSpan={3}>
                {t.report.total}
              </td>
              <td className={cell}>
                {totals.fillerMl.max > 0 && (
                  <div>
                    {t.est.filler}{' '}
                    <bdi>
                      {span(totals.fillerMl.min, totals.fillerMl.max)} mL · {t.est.syringes(span(totals.syringes.min, totals.syringes.max))}
                    </bdi>
                  </div>
                )}
                {totals.toxinU.max > 0 && (
                  <div>
                    {t.est.toxin}{' '}
                    <bdi>
                      {span(totals.toxinU.min, totals.toxinU.max)} U · {t.est.vials(span(totals.vials.min, totals.vials.max))}
                    </bdi>
                  </div>
                )}
                {totals.threads.max > 0 && (
                  <div>
                    {t.est.threads} <bdi>{span(totals.threads.min, totals.threads.max)}</bdi>
                  </div>
                )}
                {totals.sessions.max > 0 && (
                  <div>
                    {t.est.sessions} <bdi>{span(totals.sessions.min, totals.sessions.max)}</bdi>
                  </div>
                )}
              </td>
              {hasTariff && (
                <td className={cell} data-total-cost={`${totals.cost.min}-${totals.cost.max}`}>
                  <bdi>{money(totals.cost)}</bdi>
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      )}
      {hasTariff && totals.costMissing > 0 && rows.length > 0 && (
        <p className="mt-1 text-[11px] text-paper-muted">{t.est.costMissing(span(totals.costMissing, totals.costMissing))}</p>
      )}
      {anyDraft && <p className="mt-1 text-[11px] text-paper-muted">{t.report.draftNote}</p>}
    </>
  );
}
