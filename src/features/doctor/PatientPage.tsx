import { Copy, Plus, Send, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Header, LinkButton, Notice, Page, Section, Tag } from '../../components/ui';
import { db, uid } from '../../db/db';
import { deletePatient } from '../../db/repo';
import { formatDate, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { buildPatientPackage, shareJson } from '../../share/exchange';
import { useApp } from '../../store/app';

export function PatientPage() {
  const { patientId = '' } = useParams();
  const t = useT();
  const lang = useApp((s) => s.lang);
  const nav = useNavigate();
  const [reply, setReply] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const data = useLive(async () => {
    const p = await db.patients.get(patientId);
    if (!p) return null;
    const cases = (await db.cases.where('patientId').equals(patientId).toArray()).sort((a, b) => b.createdAt - a.createdAt);
    const messages = (await db.messages.where({ owner: 'doctor', patientCode: p.code }).toArray()).sort((a, b) => a.at - b.at);
    return { p, cases, messages };
  }, [patientId]);

  if (data === null) return <Header title="—" back="/doctor" />;
  if (!data) return null;
  const { p, cases, messages } = data;

  const addReply = async () => {
    if (!reply.trim()) return;
    await db.messages.add({ id: uid(), owner: 'doctor', patientCode: p.code, from: 'doctor', text: reply.trim(), at: Date.now(), sent: false });
    setReply('');
  };

  const exportPkg = async () => {
    const pkg = await buildPatientPackage(p.id);
    await shareJson(pkg, `tanasob-${p.code}.json`);
    setNote(t.report.exported);
  };

  return (
    <>
      <Header title={p.displayName} back="/doctor" />
      <Page>
        <div className="card mb-4">
          <div className="text-[12px] text-ink-secondary">{t.patients.code}</div>
          <div className="flex items-center gap-2">
            <span className="gold-text text-[22px] font-bold tracking-wider" dir="ltr">
              {p.code}
            </span>
            <button
              type="button"
              aria-label="copy"
              className="flex h-11 w-11 items-center justify-center rounded-md border border-border"
              onClick={() => void navigator.clipboard?.writeText(p.code)}
            >
              <Copy size={16} />
            </button>
          </div>
          <div className="mt-1 text-[13px] text-ink-secondary" dir="ltr">
            {p.fileNo} · {p.birthYear} · {t.patient.sexes[p.sex]}
          </div>
        </div>

        <Section
          title={t.patient.cases}
          right={
            <LinkButton to={`/doctor/new?patient=${p.id}`} variant="soft" className="!min-h-[40px]">
              <Plus size={16} /> {t.patient.newCase}
            </LinkButton>
          }
        >
          <ul className="flex flex-col gap-2">
            {cases.map((c) => (
              <li key={c.id}>
                <Link to={`/doctor/case/${c.id}/${c.status === 'signed' ? 'report' : 'capture'}`} className="card flex items-center justify-between hover:border-gold/60">
                  <span>
                    <span className="block font-semibold">{formatDate(c.createdAt, lang)}</span>
                    <span className="text-[12px] text-ink-secondary">
                      {t.age.actual} {c.actualAge} → {t.age.target} {c.targetAge}
                    </span>
                  </span>
                  <Tag tone={c.status === 'signed' ? 'ok' : 'warn'}>{t.patients.status[c.status]}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.patient.messages}>
          <div className="card flex flex-col gap-2">
            {messages.length === 0 && <p className="text-[13px] text-ink-secondary">{t.patient.noMessages}</p>}
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-[14px] ${m.from === 'doctor' ? 'self-end bg-gold-tint text-gold-ink' : 'self-start bg-surface-2'}`}>
                <div className="mb-0.5 text-[11px] opacity-70">
                  {m.from === 'doctor' ? t.patient.fromDoctor : t.patient.fromPatient} · {formatDate(m.at, lang)}
                  {m.from === 'doctor' && !m.sent && ` · ${t.patient.pending}`}
                </div>
                {m.text}
              </div>
            ))}
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder={t.patient.reply} aria-label={t.patient.reply} />
            <Button variant="soft" onClick={() => void addReply()} disabled={!reply.trim()}>
              <Send size={16} /> {t.patient.send}
            </Button>
          </div>
        </Section>

        <Section title={t.patient.exportPkg}>
          <p className="mb-2 text-[13px] text-ink-secondary">{t.patient.exportHint}</p>
          <Button variant="gold" className="w-full" onClick={() => void exportPkg()}>
            <Share2 size={18} /> {t.patient.exportPkg}
          </Button>
          {note && (
            <div className="mt-2">
              <Notice tone="gold">{note}</Notice>
            </div>
          )}
        </Section>

        <Button
          variant="danger"
          className="mt-6 w-full"
          onClick={async () => {
            if (!window.confirm(t.patient.deleteConfirm)) return;
            await deletePatient(p.id);
            nav('/doctor');
          }}
        >
          <Trash2 size={16} /> {t.patient.deletePatient}
        </Button>
      </Page>
    </>
  );
}
