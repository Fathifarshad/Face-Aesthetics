import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATALOG } from '../../analysis/catalog';
import type { FindingTab, Severity } from '../../analysis/types';
import { FINDING_ZONES, type ZoneId } from '../../analysis/zones';
import { FaceCanvas, type Overlay } from '../../components/FaceCanvas';
import { BottomBar, Button, Chip, Header, Notice, Page, SeverityDots, Tag } from '../../components/ui';
import { db } from '../../db/db';
import { ensureFindings, frontalPhoto, recomputeFindings, updateFinding } from '../../db/repo';
import type { FindingRow } from '../../db/types';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { CaseSteps } from './CaseSteps';
import { useCase } from './useCase';

const TABS: FindingTab[] = ['volume', 'proportions', 'dynamics', 'lips', 'skin'];

export function AnalysisPage() {
  const { caseId = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const data = useCase(caseId);
  const [tab, setTab] = useState<FindingTab>('volume');
  const [layers, setLayers] = useState({ landmarks: false, guides: true, midline: true, heat: true });

  useEffect(() => {
    void ensureFindings(caseId);
  }, [caseId]);
  const photo = useLive(() => frontalPhoto(caseId), [caseId]);
  const findings = useLive(() => db.findings.where('caseId').equals(caseId).toArray(), [caseId]);

  const heat = useMemo(() => {
    const h: Partial<Record<ZoneId, number>> = {};
    for (const f of findings ?? []) {
      if (f.status === 'rejected' || !f.severity) continue;
      for (const k of [f.key, ...f.planKeys]) for (const z of FINDING_ZONES[k] ?? []) h[z] = Math.max(h[z] ?? 0, f.severity);
    }
    return h;
  }, [findings]);

  const overlay: Overlay = useMemo(
    () => ({ landmarks: layers.landmarks ? 'named' : false, guides: layers.guides, midline: layers.midline, heat: layers.heat ? heat : undefined }),
    [layers, heat],
  );

  if (!data) return null;
  const { c, patient } = data;
  const list = (findings ?? []).filter((f) => f.tab === tab);

  return (
    <>
      <Header title={`${t.analysis.title} — ${patient.displayName}`} back={`/doctor/case/${caseId}/capture`} />
      <Page>
        <CaseSteps caseId={c.id} />
        {photo ? (
          <div className="mb-3">
            <FaceCanvas blob={photo.blob} landmarks={photo.landmarks} overlay={overlay} alt={t.analysis.title} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(Object.keys(layers) as (keyof typeof layers)[]).map((k) => (
                <Chip key={k} active={layers[k]} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} className="!px-3">
                  {t.analysis.layers[k]}
                </Chip>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-ink-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-priority/70" /> {t.analysis.highPriority}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-gold/60" /> {t.analysis.midPriority}
              </span>
              <span>
                {t.analysis.norm}: {t.patient.norms[patient.ethnicityNorm as keyof typeof t.patient.norms] ?? patient.ethnicityNorm}
              </span>
            </div>
          </div>
        ) : (
          <Notice tone="warn">{t.analysis.noPhoto}</Notice>
        )}

        <div role="tablist" className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
          {TABS.map((k) => (
            <Chip key={k} active={tab === k} onClick={() => setTab(k)} className="shrink-0">
              {t.analysis.tabs[k]}
            </Chip>
          ))}
        </div>
        {tab === 'skin' && (
          <div className="mb-2">
            <Notice>{t.analysis.skinPlaceholder}</Notice>
          </div>
        )}
        {tab === 'proportions' && (
          <div className="mb-2">
            <Notice>{t.analysis.approxNote}</Notice>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {list.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}
        </div>
        <Button className="mt-4" onClick={() => void recomputeFindings(caseId)}>
          <RotateCcw size={16} /> {t.analysis.recompute}
        </Button>
      </Page>
      <BottomBar>
        <Button variant="gold" className="flex-1" onClick={() => nav(`/doctor/case/${caseId}/age`)}>
          {t.analysis.toAge}
        </Button>
      </BottomBar>
    </>
  );
}

function formatValue(f: FindingRow, num: (n: number, d?: number) => string): string {
  if (f.display && f.source === 'auto') return f.display;
  if (f.value === null) return '—';
  const digits = f.unit === '' ? 2 : 1;
  const approx = f.unit === 'mm' ? '≈ ' : '';
  return `${approx}${num(f.value, digits)}${f.unit ? ` ${f.unit}` : ''}`;
}

function FindingCard({ f }: { f: FindingRow }) {
  const t = useT();
  const bi = useBi();
  const num = useNum();
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>(f.source === 'clinician' && f.severity === null ? 'edit' : 'view');
  const [reason, setReason] = useState('');
  const cat = CATALOG[f.key];
  const conf = f.confidence === 'manual' ? t.analysis.manual : `${num(Math.round(f.confidence * 100))}%`;
  const statusTone = f.status === 'confirmed' ? 'ok' : f.status === 'rejected' ? 'danger' : f.status === 'edited' ? 'gold' : 'neutral';

  return (
    <article className={`card flex flex-col gap-2 ${f.status === 'rejected' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{cat ? bi(cat.label) : f.key}</h3>
          {f.scaleName && <div className="text-[12px] text-ink-secondary">{f.scaleName}</div>}
        </div>
        <Tag tone={statusTone}>{t.analysis.status[f.status]}</Tag>
      </div>

      {f.source === 'auto' && (
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <div>
            <span className="text-ink-tertiary">{t.analysis.value}: </span>
            <span dir="ltr">{formatValue(f, num)}</span>
          </div>
          <div>
            <span className="text-ink-tertiary">{t.analysis.reference}: </span>
            <span dir="ltr">{f.reference}</span>
          </div>
        </div>
      )}
      {cat && <p className="text-[12px] text-ink-secondary">{bi(cat.about)}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <SeverityDots value={f.severity} label={f.severity !== null ? t.analysis.of4(num(f.severity)) : '—'} />
        <span className="text-[13px] font-semibold">{f.severity !== null ? t.analysis.of4(num(f.severity)) : '—'}</span>
        <span className="text-[12px] text-ink-secondary">
          {t.analysis.confidence} {conf}
        </span>
        <span className="text-[12px] text-ink-tertiary">{f.source === 'auto' ? t.analysis.sourceAuto : t.analysis.sourceClinician}</span>
      </div>
      {f.source === 'clinician' && f.display && f.severitySuggested !== null && <p className="text-[11px] text-ink-tertiary">{t.analysis.proxyNote}</p>}
      {f.status === 'rejected' && f.note && <p className="text-[12px] text-danger">{f.note}</p>}

      {mode === 'edit' && (
        <div className="flex flex-wrap gap-1.5">
          {([0, 1, 2, 3, 4] as Severity[]).map((s) => (
            <Chip
              key={s}
              active={f.severity === s}
              className="!min-w-[44px] !px-0"
              onClick={() => {
                void updateFinding(f, { severity: s, status: f.severitySuggested === s ? 'confirmed' : 'edited' });
                setMode('view');
              }}
            >
              {num(s)}
            </Chip>
          ))}
        </div>
      )}
      {mode === 'reject' && (
        <div className="flex flex-col gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.analysis.rejectReason} aria-label={t.analysis.rejectReason} />
          <Button
            variant="danger"
            disabled={!reason.trim()}
            onClick={() => {
              void updateFinding(f, { status: 'rejected', note: reason.trim() });
              setMode('view');
            }}
          >
            {t.analysis.reject}
          </Button>
        </div>
      )}

      <div className="flex gap-1.5">
        <Button variant="soft" disabled={f.severity === null} onClick={() => void updateFinding(f, { status: 'confirmed', note: undefined })}>
          {t.analysis.confirm}
        </Button>
        <Button onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>
          {t.analysis.editSeverity}
        </Button>
        <Button onClick={() => setMode(mode === 'reject' ? 'view' : 'reject')}>
          {t.analysis.reject}
        </Button>
      </div>
    </article>
  );
}
