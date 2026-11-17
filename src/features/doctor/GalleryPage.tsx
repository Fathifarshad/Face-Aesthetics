import { EyeOff, ImageDown } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { requiredViews } from '../../capture/services';
import { viewById } from '../../capture/views';
import { Button, Chip, Header, LinkButton, Notice, Page, Section, Tag } from '../../components/ui';
import { canShare, exportPurposes, mustMaskEyes, photoUse } from '../../data/consentGate';
import { reviewPending } from '../../data/clinicalReview';
import { afterPhotoWindow } from '../../data/photoProtocol';
import type { Modality, TreatmentOption } from '../../data/treatmentOptions';
import { CONCERN_IDS, type PhotoUse } from '../../data/types';
import { audit } from '../../db/db';
import { listPhotos } from '../../db/images';
import { getSimState, listGrades } from '../../db/simRepo';
import type { Photo } from '../../db/types';
import { formatDate, useBi, useT } from '../../i18n';
import { useLive, useObjectUrl } from '../../lib/hooks';
import { shareFile } from '../../share/exchange';
import { useApp } from '../../store/app';
import { CaseSteps } from './CaseSteps';
import { ConsentPanel } from './ConsentPanel';
import { useConsents } from './useConsents';
import { canMaskEyes, composeBeforeAfter } from './galleryExport';
import { screen } from './optionScreening';
import { chosenOptions, usable } from './simDefaults';
import { useCase } from './useCase';

/**
 * PRD F8: before/after pairs per view, the "after" photo time per chosen modality (PRD §8), the level-3
 * consent with revocation, and a shareable before/after file that only the consent gate can open.
 */
export function GalleryPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const bi = useBi();
  const lang = useApp((s) => s.lang);
  const data = useCase(caseId);
  const consents = useConsents(data?.patient.id);
  const photos = useLive(() => listPhotos(caseId), [caseId]);
  const grades = useLive(() => listGrades(caseId), [caseId]);
  const sim = useLive(() => getSimState(caseId), [caseId]);
  const [view, setView] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<PhotoUse | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  if (!data || !consents || !photos || !grades || !sim) return null;
  const { c, patient } = data;
  const date = (ts: number) => formatDate(ts, lang).split(' (')[0]!;
  const of = (phase: Photo['phase'], v: string) => photos.find((p) => p.phase === phase && p.view === v);

  const views = [...new Set([...requiredViews(c.services), ...photos.map((p) => p.view)])];
  const pairs = views.filter((v) => of('before', v) && of('after', v));
  const taken = views.filter((v) => of('before', v) || of('after', v));
  const untaken = views.filter((v) => !taken.includes(v));
  const viewName = (v: string) => (viewById(v) ? bi(viewById(v)!.label) : v);
  const shareable = canShare(consents, 'patient');
  const use = photoUse(consents);
  const purposes = exportPurposes(consents);
  const mask = mustMaskEyes(consents);
  const chosenView = view && pairs.includes(view) ? view : (pairs[0] ?? null);
  const chosenPurpose = purpose && purposes.includes(purpose) ? purpose : (purposes.at(-1) ?? null);

  // "After" photo time per chosen modality, counted from the first "before" photo (PRD §8).
  const allowed = (o: TreatmentOption) => screen(o, c.intake).blocks.length === 0;
  const concerns = CONCERN_IDS.filter((id) => grades.some((g) => g.concernId === id && usable(g) && g.grade >= 1));
  const chosen = chosenOptions(concerns, sim.options ?? {}, grades, allowed);
  const modalities = [...new Set(concerns.map((id) => chosen[id]?.modality).filter((m): m is Modality => !!m))];
  const start = Math.min(...photos.filter((p) => p.phase === 'before').map((p) => p.takenAt));

  const exportFile = async () => {
    if (!chosenView || !chosenPurpose || !canShare(consents, chosenPurpose)) return;
    const before = of('before', chosenView)!;
    const after = of('after', chosenView)!;
    setState('busy');
    try {
      const blob = await composeBeforeAfter({
        before,
        after,
        maskEyes: mask,
        labels: { before: `${t.capture.before} · ${date(before.takenAt)}`, after: `${t.capture.after} · ${date(after.takenAt)}` },
      });
      await shareFile(new File([blob], `before-after-${chosenView}.jpg`, { type: 'image/jpeg' }));
      await audit(caseId, 'gallery.export', undefined, { view: chosenView, purpose: chosenPurpose, maskEyes: mask });
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <>
      <Header title={`${t.nav.gallery} — ${patient.displayName}`} back={`/doctor/patient/${patient.id}`} />
      <Page>
        <CaseSteps caseId={caseId} />

        <Section title={t.gallery.consent}>
          <ConsentPanel patientId={patient.id} scopes={['beforeAfter']} />
          {!use && (
            <div className="mt-2">
              <Notice tone="warn">{t.consent.level3None}</Notice>
            </div>
          )}
        </Section>

        <Section title={t.gallery.due}>
          <div className="card text-[13px]" data-due>
            {modalities.length === 0 || !Number.isFinite(start) ? (
              <p className="text-ink-2">{modalities.length === 0 ? t.gallery.dueEmpty : t.gallery.noPhotos}</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1">
                  {modalities.map((m) => {
                    const w = afterPhotoWindow(m, start);
                    const name = t.options.modality[m];
                    return <li key={m}>{w ? t.gallery.dueRow(name, date(w.from), date(w.to)) : t.gallery.dueNone(name)}</li>;
                  })}
                </ul>
                <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-2">
                  {reviewPending() && <Tag tone="warn">{t.options.unverified}</Tag>} {t.gallery.dueNote}
                </p>
              </>
            )}
          </div>
        </Section>

        <Section title={t.gallery.pairs}>
          {photos.length === 0 ? (
            <Notice>{t.gallery.noPhotos}</Notice>
          ) : (
            <ul className="flex flex-col gap-2">
              {taken.map((v) => (
                <li key={v} className="card" data-pair={v}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold">{viewById(v) ? bi(viewById(v)!.label) : v}</span>
                    {!shareable && (
                      <Tag>
                        <EyeOff size={13} /> {t.gallery.hidden}
                      </Tag>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Thumb photo={of('before', v)} label={t.capture.before} empty={t.gallery.noBefore} date={date} />
                    <Thumb photo={of('after', v)} label={t.capture.after} empty={t.gallery.noAfter} date={date} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {photos.length > 0 && untaken.length > 0 && (
            <p className="mt-2 text-[12px] text-ink-2" data-untaken>
              {t.gallery.untaken(untaken.map(viewName).join('، '))}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <LinkButton to={`/doctor/case/${caseId}/capture`} variant="soft">
              {t.gallery.takeAfter}
            </LinkButton>
            <LinkButton to={`/doctor/case/${caseId}/compare`} variant="ghost">
              {t.gallery.compare}
            </LinkButton>
          </div>
        </Section>

        <Section title={t.gallery.export}>
          <div className="card flex flex-col gap-3" data-export>
            {purposes.length === 0 ? (
              <Notice tone="warn">{t.gallery.exportBlocked}</Notice>
            ) : pairs.length === 0 ? (
              <Notice>{t.gallery.exportNeedsPair}</Notice>
            ) : (
              <>
                <div>
                  <span className="label">{t.gallery.exportView}</span>
                  <div className="flex flex-wrap gap-2">
                    {pairs.map((v) => (
                      <Chip key={v} active={chosenView === v} onClick={() => setView(v)}>
                        {viewById(v) ? bi(viewById(v)!.label) : v}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="label">{t.gallery.exportFor}</span>
                  <div className="flex flex-wrap gap-2">
                    {purposes.map((p) => (
                      <Chip key={p} active={chosenPurpose === p} onClick={() => setPurpose(p)}>
                        {t.consent.use[p]}
                      </Chip>
                    ))}
                  </div>
                </div>
                <p className="text-[12px] text-ink-2">{mask ? t.consent.eyesMasked : t.consent.eyesShown}</p>
                {mask && chosenView && !canMaskEyes(of('before', chosenView)!, of('after', chosenView)!) ? (
                  <Notice tone="warn">{t.gallery.exportNoEyes}</Notice>
                ) : (
                  <Button variant="primary" disabled={state === 'busy'} onClick={() => void exportFile()}>
                    <ImageDown size={18} /> {t.gallery.exportMake}
                  </Button>
                )}
                {state === 'done' && (
                  <div role="status" data-export-state="done">
                    <Notice tone="primary">{t.gallery.exportDone}</Notice>
                  </div>
                )}
                {state === 'error' && (
                  <div role="status" data-export-state="error">
                    <Notice tone="danger">{t.gallery.exportError}</Notice>
                  </div>
                )}
              </>
            )}
          </div>
        </Section>
      </Page>
    </>
  );
}

function Thumb({ photo, label, empty, date }: { photo: Photo | undefined; label: string; empty: string; date: (ts: number) => string }) {
  const url = useObjectUrl(photo?.blob);
  return (
    <figure className="flex flex-col gap-1">
      {url ? (
        <img src={url} alt={label} className="aspect-[3/4] w-full rounded-md bg-photo object-cover" />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded-md bg-surface-2 p-2 text-center text-[12px] text-ink-2">{empty}</div>
      )}
      <figcaption className="text-[12px] text-ink-2">
        {label}
        {photo && (
          <>
            {' · '}
            <bdi>{date(photo.takenAt)}</bdi>
          </>
        )}
      </figcaption>
    </figure>
  );
}
