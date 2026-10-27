import { Phone, Send, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { requiredViews } from '../../capture/services';
import { viewById } from '../../capture/views';
import { CaptureSlot } from '../../components/CaptureSlot';
import { CompareSlider } from '../../components/CompareSlider';
import { Button, Chip, Header, Notice, Page, Section, Tag } from '../../components/ui';
import { db, uid } from '../../db/db';
import type { PtCase, PtPhoto, PtRecord } from '../../db/types';
import { formatDate, useBi, useNum, useT } from '../../i18n';
import { useLive, useObjectUrl } from '../../lib/hooks';
import { buildReplyPackage, shareJson } from '../../share/exchange';
import { useApp } from '../../store/app';

type Tab = 'plan' | 'photos' | 'care' | 'chat';

export function ClientRecord() {
  const { code = '' } = useParams();
  const t = useT();
  const [tab, setTab] = useState<Tab>('plan');
  const data = useLive(async () => {
    const rec = await db.ptRecords.get(code);
    if (!rec) return null;
    const photos = await db.ptPhotos.where('code').equals(code).toArray();
    const messages = (await db.messages.where({ owner: 'patient', patientCode: code }).toArray()).sort((a, b) => a.at - b.at);
    return { rec, photos, messages };
  }, [code]);
  if (data === null) return <Header title={t.client.notFound} back="/client" />;
  if (!data) return null;
  const { rec, photos, messages } = data;
  const latest = [...rec.cases].sort((a, b) => b.date - a.date)[0];

  return (
    <>
      <Header title={rec.clinic.name || t.client.title} back="/client" />
      <Page>
        <div className="card mb-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">{rec.patientName}</div>
            <div className="text-[12px] text-ink-secondary" dir="ltr">
              {rec.code}
            </div>
          </div>
          {rec.clinic.phone && (
            <a href={`tel:${rec.clinic.phone}`} className="flex h-11 items-center gap-2 rounded-md border border-border px-3 text-gold-ink">
              <Phone size={16} /> <span dir="ltr">{rec.clinic.phone}</span>
            </a>
          )}
        </div>
        <div role="tablist" className="mb-4 grid grid-cols-4 gap-1.5">
          {(['plan', 'photos', 'care', 'chat'] as const).map((k) => (
            <Chip key={k} active={tab === k} onClick={() => setTab(k)} className="!px-2">
              {t.client.tabs[k]}
            </Chip>
          ))}
        </div>
        {tab === 'plan' && rec.cases.map((c) => <PlanView key={c.id} c={c} />)}
        {tab === 'photos' && latest && <PhotosView rec={rec} c={latest} photos={photos} />}
        {tab === 'care' && <CareView rec={rec} />}
        {tab === 'chat' && <ChatView code={code} messages={messages} queuedPhotos={photos.filter((p) => p.phase === 'progress' && !p.sent).length} />}
      </Page>
    </>
  );
}

function PlanView({ c }: { c: PtCase }) {
  const t = useT();
  const bi = useBi();
  const num = useNum();
  const lang = useApp((s) => s.lang);
  return (
    <article className="card mb-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-gold-ink">
          {t.client.visit} · {formatDate(c.date, lang)}
        </span>
        <Tag>{c.doctorName}</Tag>
      </div>
      <h3 className="text-[13px] font-semibold text-ink-secondary">{t.client.areas}</h3>
      <ul className="mb-3 mt-1 flex flex-col gap-1">
        {c.findings.map((f) => (
          <li key={f.key} className="text-[14px]">
            <b>{bi(f.label)}</b> — <span className="text-ink-secondary">{bi(f.patient)}</span>
          </li>
        ))}
      </ul>
      <h3 className="text-[13px] font-semibold text-ink-secondary">{t.client.timeline}</h3>
      <ol className="mt-1 flex flex-col gap-1.5 border-s border-gold/40 ps-3">
        {c.sessions.map((s) => (
          <li key={s.index} className="text-[14px]">
            <span className="font-semibold">{t.plan.session(num(s.index + 1))}</span>
            {s.after && <span className="text-[12px] text-ink-tertiary"> · {bi(s.after)}</span>}
            <div className="text-ink-secondary">{s.items.map(bi).join('، ')}</div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-ink-tertiary">{t.report.disclaimer}</p>
    </article>
  );
}

function PhotosView({ rec, c, photos }: { rec: PtRecord; c: PtCase; photos: PtPhoto[] }) {
  const t = useT();
  const num = useNum();
  const of = (phase: PtPhoto['phase'], view = 'frontal') =>
    photos.filter((p) => p.caseId === c.id && p.phase === phase && p.view === view).sort((a, b) => b.takenAt - a.takenAt)[0];
  const before = of('before');
  const sim = of('simulation');
  const after = of('progress') ?? of('after');
  const views = requiredViews(c.services);

  const saveProgress = async (view: string, blob: Blob) => {
    await db.ptPhotos.add({ id: uid(), code: rec.code, caseId: c.id, phase: 'progress', view, blob, takenAt: Date.now(), sent: false });
  };

  return (
    <>
      {before && sim && (
        <Section title={t.client.simulation}>
          <CompareSlider left={before.blob} right={sim.blob} leftLabel={t.age.before} rightLabel={`${t.age.afterSim} · ${num(c.targetAge)}`} />
          <p className="mt-1 text-[11px] text-ink-tertiary">{t.age.simNote}</p>
        </Section>
      )}
      {before && after && (
        <Section title={t.report.compare}>
          <CompareSlider left={before.blob} right={after.blob} leftLabel={t.capture.before} rightLabel={t.capture.after} />
        </Section>
      )}
      <Section title={t.capture.before}>
        <div className="grid grid-cols-3 gap-2">
          {photos
            .filter((p) => p.caseId === c.id && p.phase === 'before')
            .map((p) => (
              <Thumb key={p.id} blob={p.blob} label={viewById(p.view)?.label ?? { fa: p.view, en: p.view }} />
            ))}
        </div>
      </Section>
      <Section title={t.client.progress}>
        <p className="mb-2 text-[13px] text-ink-secondary">{t.client.progressHint}</p>
        <div className="flex flex-col gap-2">
          {views.map((v) => {
            const p = of('progress', v);
            return (
              <CaptureSlot
                key={v}
                view={viewById(v)!}
                photo={p ? { blob: p.blob, lowQuality: false, qc: null } : null}
                ghost={of('before', v)?.blob}
                onSave={(proc) => saveProgress(v, proc.blob)}
                defaultOpen={v === views.find((x) => !of('progress', x))}
              />
            );
          })}
        </div>
      </Section>
    </>
  );
}

function Thumb({ blob, label }: { blob: Blob; label: { fa: string; en: string } }) {
  const url = useObjectUrl(blob);
  const bi = useBi();
  return (
    <figure>
      {url && <img src={url} alt={bi(label)} className="aspect-[3/4] w-full rounded-md object-cover" />}
      <figcaption className="truncate text-center text-[11px] text-ink-secondary">{bi(label)}</figcaption>
    </figure>
  );
}

function CareView({ rec }: { rec: PtRecord }) {
  const t = useT();
  const items = rec.cases.flatMap((c) => c.aftercare);
  return (
    <>
      <div className="mb-3">
        <Notice tone="danger">{t.client.emergencyNote}</Notice>
      </div>
      {items.length === 0 ? (
        <Notice>{t.client.noCare}</Notice>
      ) : (
        items.map((a, i) => (
          <article key={`${a.modality}-${i}`} className="card mb-2">
            <h3 className="font-semibold text-gold-ink">{t.plan.modality[a.modality] ?? a.modality}</h3>
            <p className="mt-1 whitespace-pre-line text-[14px]">{a.text}</p>
          </article>
        ))
      )}
    </>
  );
}

function ChatView({ code, messages, queuedPhotos }: { code: string; messages: { id: string; from: string; text: string; at: number; sent: boolean }[]; queuedPhotos: number }) {
  const t = useT();
  const num = useNum();
  const lang = useApp((s) => s.lang);
  const [text, setText] = useState('');
  const queued = messages.filter((m) => m.from === 'patient' && !m.sent).length + queuedPhotos;
  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 ${m.from === 'patient' ? 'self-end bg-gold-tint text-gold-ink' : 'self-start bg-surface-2'}`}>
          <div className="mb-0.5 text-[11px] opacity-70">
            {m.from === 'patient' ? t.patient.fromPatient : t.patient.fromDoctor} · {formatDate(m.at, lang).split(' (')[0]}
            {m.from === 'patient' && !m.sent && ` · ${t.client.queued}`}
          </div>
          {m.text}
        </div>
      ))}
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.client.ask} aria-label={t.client.ask} />
      <Button
        variant="soft"
        disabled={!text.trim()}
        onClick={async () => {
          await db.messages.add({ id: uid(), owner: 'patient', patientCode: code, from: 'patient', text: text.trim(), at: Date.now(), sent: false });
          setText('');
        }}
      >
        <Send size={16} /> {t.client.addQuestion}
      </Button>
      <p className="mt-2 text-[12px] text-ink-secondary">{t.client.sendHint}</p>
      <Button variant="gold" disabled={queued === 0} onClick={async () => shareJson(await buildReplyPackage(code), `tanasob-reply-${code}.json`)}>
        <Share2 size={18} /> {t.client.sendToClinic} ({num(queued)})
      </Button>
    </div>
  );
}
