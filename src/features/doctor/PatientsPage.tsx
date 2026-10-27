import { FileUp, MessageCircle, Plus, Search, Settings } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Header, LangToggle, LinkButton, Notice, Page, Tag } from '../../components/ui';
import { db } from '../../db/db';
import { normalizePatientCode } from '../../db/patientCode';
import { formatDate, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { importIntoDoctor } from '../../share/exchange';
import { parseIncoming } from '../../share/format';
import { useApp } from '../../store/app';

export function PatientsPage() {
  const t = useT();
  const num = useNum();
  const lang = useApp((s) => s.lang);
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ tone: 'gold' | 'danger'; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const data = useLive(async () => {
    const [patients, cases, messages] = await Promise.all([db.patients.toArray(), db.cases.toArray(), db.messages.where('at').above(0).toArray()]);
    return { patients, cases, messages: messages.filter((m) => m.owner === 'doctor' && m.from === 'patient') };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const code = normalizePatientCode(q);
    return data.patients
      .map((p) => {
        const cs = data.cases.filter((c) => c.patientId === p.id).sort((a, b) => b.createdAt - a.createdAt);
        const answered = new Set(data.messages.filter((m) => m.patientCode === p.code).map((m) => m.id));
        return { p, latest: cs[0], count: cs.length, questions: answered.size };
      })
      .filter(
        ({ p }) =>
          !needle ||
          p.displayName.toLowerCase().includes(needle) ||
          p.fileNo.toLowerCase().includes(needle) ||
          p.code.toLowerCase().includes(needle) ||
          (code !== null && p.code === code),
      )
      .sort((a, b) => (b.latest?.createdAt ?? b.p.createdAt) - (a.latest?.createdAt ?? a.p.createdAt));
  }, [data, q]);

  const awaiting = data?.cases.filter((c) => c.status === 'awaiting-signoff' || c.status === 'draft').length ?? 0;
  const follow = data?.cases.filter((c) => c.status === 'follow-up').length ?? 0;

  const importFile = async (f: File) => {
    try {
      const pkg = parseIncoming(await f.text());
      if (pkg.format !== 'tanasob/patient-reply') throw new Error('unknown-format');
      const r = await importIntoDoctor(pkg);
      setMsg({ tone: 'gold', text: `${t.patients.imported}: ${t.patient.messages} ${num(r.messages)} · ${t.capture.title} ${num(r.photos)}` });
      nav(`/doctor/patient/${r.patientId}`);
    } catch (e) {
      setMsg({ tone: 'danger', text: `${t.app.error}: ${(e as Error).message}` });
    }
  };

  return (
    <>
      <Header
        title={t.patients.title}
        back="/"
        right={
          <>
            <LangToggle />
            <Link to="/settings" aria-label={t.app.settings} className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface">
              <Settings size={18} />
            </Link>
          </>
        }
      />
      <Page>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {[
            [t.patients.awaiting, awaiting, 'text-warn-ink'],
            [t.patients.followUp, follow, 'text-gold-ink'],
            [t.patients.total, data?.cases.length ?? 0, 'text-ink'],
          ].map(([label, n, cls]) => (
            <div key={String(label)} className="card text-center">
              <div className={`text-[22px] font-bold ${cls}`}>{num(Number(n))}</div>
              <div className="text-[12px] text-ink-secondary">{label}</div>
            </div>
          ))}
        </div>

        <div className="relative mb-3">
          <Search size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.patients.search} className="w-full ps-10" aria-label={t.patients.search} />
        </div>

        <div className="mb-4 flex gap-2">
          <LinkButton to="/doctor/new" className="flex-1">
            <Plus size={18} /> {t.patients.newAnalysis}
          </LinkButton>
          <Button onClick={() => file.current?.click()}>
            <FileUp size={18} /> {t.app.importFile}
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </div>
        {msg && (
          <div className="mb-3">
            <Notice tone={msg.tone}>{msg.text}</Notice>
          </div>
        )}

        {rows.length === 0 && <p className="py-10 text-center text-ink-secondary">{t.patients.empty}</p>}
        <ul className="flex flex-col gap-2">
          {rows.map(({ p, latest, count, questions }) => (
            <li key={p.id}>
              <Link to={`/doctor/patient/${p.id}`} className="card flex items-center gap-3 hover:border-gold/60">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-tint font-bold text-gold-ink">
                  {p.displayName.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.displayName}</span>
                  <span className="block truncate text-[12px] text-ink-secondary" dir="ltr">
                    {p.code} · {p.fileNo}
                  </span>
                  {latest && <span className="block text-[12px] text-ink-tertiary">{formatDate(latest.createdAt, lang)}</span>}
                </span>
                <span className="flex flex-col items-end gap-1">
                  {latest && <Tag tone={latest.status === 'signed' ? 'ok' : latest.status === 'follow-up' ? 'gold' : 'warn'}>{t.patients.status[latest.status]}</Tag>}
                  <span className="flex items-center gap-2 text-[12px] text-ink-tertiary">
                    {questions > 0 && (
                      <span className="flex items-center gap-1 text-gold-ink">
                        <MessageCircle size={13} />
                        {num(questions)}
                      </span>
                    )}
                    {num(count)}×
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Page>
    </>
  );
}
