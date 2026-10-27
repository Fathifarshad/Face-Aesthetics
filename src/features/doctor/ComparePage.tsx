import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { viewById } from '../../capture/views';
import { CompareSlider, SideBySide } from '../../components/CompareSlider';
import { Chip, Header, Notice, Page, Section } from '../../components/ui';
import { db } from '../../db/db';
import { formatDate, useBi, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { useApp } from '../../store/app';

type Source = { key: string; label: string; blob: Blob };

export function ComparePage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const bi = useBi();
  const lang = useApp((s) => s.lang);
  const [view, setView] = useState('frontal');
  const [mode, setMode] = useState<'slider' | 'side'>('slider');
  const [leftKey, setLeftKey] = useState<string | null>(null);
  const [rightKey, setRightKey] = useState<string | null>(null);

  const data = useLive(async () => {
    const c = await db.cases.get(caseId);
    if (!c) return null;
    const cases = (await db.cases.where('patientId').equals(c.patientId).sortBy('createdAt')).reverse();
    const photos = (await Promise.all(cases.map((x) => db.photos.where('caseId').equals(x.id).toArray()))).flat();
    const sims = await db.simulations.where('caseId').equals(caseId).toArray();
    return { c, cases, photos, sims };
  }, [caseId]);
  if (!data) return null;

  const views = [...new Set(data.photos.map((p) => p.view))];
  const sources: Source[] = [];
  for (const cs of data.cases) {
    for (const ph of ['before', 'after'] as const) {
      const p = data.photos.find((x) => x.caseId === cs.id && x.view === view && x.phase === ph);
      if (p)
        sources.push({
          key: p.id,
          label: `${ph === 'before' ? t.capture.before : t.capture.after} · ${formatDate(cs.createdAt, lang).split(' (')[0]}${p.source === 'patient' ? ` · ${t.patient.fromPatient}` : ''}`,
          blob: p.blob,
        });
    }
  }
  if (view === 'frontal') for (const s of data.sims) sources.push({ key: s.id, label: `${t.compare.simulation} · ${s.targetAge}`, blob: s.blob });

  const left = sources.find((s) => s.key === leftKey) ?? sources.find((s) => s.label.startsWith(t.capture.before)) ?? sources[0];
  const right = sources.find((s) => s.key === rightKey) ?? sources.find((s) => s !== left && !s.label.startsWith(t.capture.before)) ?? sources.find((s) => s !== left);

  return (
    <>
      <Header title={t.compare.title} back />
      <Page>
        <Section title={t.compare.view}>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
            {views.map((v) => (
              <Chip key={v} active={view === v} onClick={() => setView(v)} className="shrink-0">
                {viewById(v) ? bi(viewById(v)!.label) : v}
              </Chip>
            ))}
          </div>
        </Section>
        {sources.length < 2 || !left || !right ? (
          <Notice>{t.compare.none}</Notice>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  [t.compare.left, left.key, setLeftKey],
                  [t.compare.right, right.key, setRightKey],
                ] as const
              ).map(([label, value, set]) => (
                <label key={label} className="block">
                  <span className="label">{label}</span>
                  <select className="w-full" value={value} onChange={(e) => set(e.target.value)}>
                    {sources.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mb-3 flex gap-2">
              <Chip active={mode === 'slider'} onClick={() => setMode('slider')}>
                {t.compare.slider}
              </Chip>
              <Chip active={mode === 'side'} onClick={() => setMode('side')}>
                {t.compare.side}
              </Chip>
            </div>
            {mode === 'slider' ? (
              <CompareSlider left={left.blob} right={right.blob} leftLabel={left.label} rightLabel={right.label} />
            ) : (
              <SideBySide left={left.blob} right={right.blob} leftLabel={left.label} rightLabel={right.label} />
            )}
          </>
        )}
      </Page>
    </>
  );
}
