import { Siren } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FaceCanvas, type Overlay } from '../../components/FaceCanvas';
import { Chip, Header, LinkButton, Notice, Page, Section } from '../../components/ui';
import { frontalPhoto } from '../../db/repo';
import { useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import mdcodes from '../../plan/data/mdcodes.json';

/** Licensed MD Codes rows; the file ships empty and the UI must work without it. */
type MdCodeRow = { code: string; zone: string; note?: string };
const CODES = mdcodes as MdCodeRow[];

export function MdCodesPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const photo = useLive(() => frontalPhoto(caseId), [caseId]);
  const [zones, setZones] = useState(true);
  const [vessels, setVessels] = useState(true);
  const overlay: Overlay = useMemo(() => ({ zones, vessels, zoneLabel: (z) => t.md.zoneNames[z.id] ?? z.id }), [zones, vessels, t]);

  return (
    <>
      <Header title={t.md.title} back={`/doctor/case/${caseId}/plan`} />
      <Page>
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

        <Section title={t.md.table}>
          {CODES.length === 0 ? (
            <Notice tone="gold">{t.md.notInstalled}</Notice>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-secondary">
                  <th className="py-1 text-start">{t.md.code}</th>
                  <th className="py-1 text-start">{t.md.zone}</th>
                </tr>
              </thead>
              <tbody>
                {CODES.map((r) => (
                  <tr key={r.code} className="border-t border-border">
                    <td className="py-1.5 font-semibold text-gold-ink">{r.code}</td>
                    <td className="py-1.5">{r.zone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <LinkButton to="/emergency" variant="danger" className="w-full">
          <Siren size={18} /> {t.app.emergency}
        </LinkButton>
      </Page>
    </>
  );
}
