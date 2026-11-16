import { Siren } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FaceCanvas, type Overlay } from '../../components/FaceCanvas';
import { Chip, Header, LinkButton, Notice, Page, Section, Tag } from '../../components/ui';
import { codesNamed, MD_CODE_INFO, MD_CODES_SOURCE, WARNING_CODES } from '../../data/mdCodes';
import type { TreatmentOption } from '../../data/treatmentOptions';
import { CONCERN_IDS } from '../../data/types';
import { frontalPhoto } from '../../db/repo';
import { getSimState, listGrades } from '../../db/simRepo';
import { useBi, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { CaseSteps } from './CaseSteps';
import { screen } from './optionScreening';
import { chosenOptions, usable } from './simDefaults';
import { useCase } from './useCase';

/**
 * MD Codes layer (PRD F6, M7): the codes of the chosen filler options only (F6.1), warning codes in the risk colour
 * with «کانولا توصیه می‌شود» (F6.2), names only until a senior physician enters the source table (F6.3), and the
 * fixed text of F6.4. The photo keeps the approximate zones and danger areas; the per-code zones and ranges are on
 * the simulation page in mode B.
 */
export function MdCodesPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const bi = useBi();
  const data = useCase(caseId);
  const photo = useLive(() => frontalPhoto(caseId), [caseId]);
  const grades = useLive(() => listGrades(caseId), [caseId]);
  const sim = useLive(() => getSimState(caseId), [caseId]);
  const [zones, setZones] = useState(true);
  const [vessels, setVessels] = useState(true);
  const overlay: Overlay = useMemo(() => ({ zones, vessels, zoneLabel: (z) => t.md.zoneNames[z.id] ?? z.id }), [zones, vessels, t]);

  const fillers: TreatmentOption[] = useMemo(() => {
    if (!data || !grades || !sim) return [];
    const concerns = CONCERN_IDS.filter((id) => grades.some((g) => g.concernId === id && usable(g) && g.grade >= 1));
    const allowed = (o: TreatmentOption) => screen(o, data.c.intake).blocks.length === 0;
    const chosen = chosenOptions(concerns, sim.options ?? {}, grades, allowed);
    return concerns.map((id) => chosen[id]).filter((o): o is TreatmentOption => !!o && o.modality === 'filler' && o.mdCodes.length > 0);
  }, [data, grades, sim]);

  return (
    <>
      <Header title={t.md.title} back={`/doctor/case/${caseId}/plan`} />
      <Page>
        <CaseSteps caseId={caseId} />
        {photo?.landmarks ? (
          <>
            <FaceCanvas blob={photo.blob} landmarks={photo.landmarks} overlay={overlay} alt={t.md.title} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={zones} onClick={() => setZones((z) => !z)}>
                {t.md.zones}
              </Chip>
              <Chip active={vessels} onClick={() => setVessels((v) => !v)}>
                {t.md.danger}
              </Chip>
            </div>
            {vessels && (
              <div className="mt-2">
                <Notice tone="danger">{t.md.dangerNote}</Notice>
              </div>
            )}
          </>
        ) : (
          <Notice tone="warn">{t.md.noPhoto}</Notice>
        )}
        <p className="mt-2 text-caption text-ink-2">{t.sim.mdDisclaimer}</p>

        <Section title={t.est.fillerCodes}>
          {fillers.length === 0 ? (
            <Notice tone="primary">{t.est.noFiller}</Notice>
          ) : (
            <div className="flex flex-col gap-2">
              {fillers.map((o) => (
                <article key={o.id} className="card" data-md-option={o.id}>
                  <h3 className="font-semibold text-primary-on-tint">
                    {t.concerns[o.concernId]} · {bi({ fa: o.nameFa, en: o.nameEn })}
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                    {codesNamed(o.mdCodes).map((c) => (
                      <li key={c} className="flex flex-wrap items-center gap-2" data-md-code={c}>
                        <bdi className="w-10 font-semibold" dir="ltr">
                          {c}
                        </bdi>
                        <span className="min-w-0 flex-1">{bi({ fa: MD_CODE_INFO[c].nameFa, en: MD_CODE_INFO[c].nameEn })}</span>
                        {WARNING_CODES.has(c) && <Tag tone="danger">{t.est.warning}</Tag>}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              <p className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
                <span className="inline-flex items-center rounded-md bg-draft-bg px-2 py-0.5 text-[12px] text-draft-fg">{t.options.unverified}</span>
                <span dir="ltr">{t.sim.mdSource(MD_CODES_SOURCE)}</span>
              </p>
            </div>
          )}
        </Section>

        <LinkButton to="/emergency" variant="danger" className="w-full">
          <Siren size={18} /> {t.app.emergency}
        </LinkButton>
      </Page>
    </>
  );
}
