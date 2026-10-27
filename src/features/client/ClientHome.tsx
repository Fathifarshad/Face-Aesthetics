import { FileDown, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Header, LangToggle, Notice, Page, Section } from '../../components/ui';
import { db } from '../../db/db';
import { normalizePatientCode } from '../../db/patientCode';
import { formatDate, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { importIntoClient } from '../../share/exchange';
import { parseIncoming } from '../../share/format';
import { useApp } from '../../store/app';

export function ClientHome() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const records = useLive(() => db.ptRecords.toArray(), []);

  const open = async () => {
    const c = normalizePatientCode(code);
    if (!c) return setMsg(t.client.invalidCode);
    if (!(await db.ptRecords.get(c))) return setMsg(t.client.notFound);
    nav(`/client/${c}`);
  };

  const importFile = async (f: File) => {
    try {
      const pkg = parseIncoming(await f.text());
      if (pkg.format !== 'tanasob/patient-package') throw new Error('unknown-format');
      const r = await importIntoClient(pkg);
      nav(`/client/${r.code}`);
    } catch (e) {
      setMsg(`${t.app.error}: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <Header title={t.client.title} back="/" right={<LangToggle />} />
      <Page>
        <Section title={t.client.importPkg}>
          <p className="mb-2 text-[13px] text-ink-secondary">{t.client.importHint}</p>
          <Button variant="gold" className="w-full" onClick={() => file.current?.click()}>
            <FileDown size={18} /> {t.client.importPkg}
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
        </Section>

        <Section title={t.client.enterCode}>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 uppercase tracking-wider" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TN-XXXX-XXXX-X" dir="ltr" aria-label={t.client.enterCode} />
            <Button onClick={() => void open()}>{t.client.open}</Button>
          </div>
        </Section>
        {msg && <Notice tone="warn">{msg}</Notice>}

        {records && records.length > 0 && (
          <Section title={t.client.myRecords}>
            <ul className="flex flex-col gap-2">
              {records.map((r) => (
                <li key={r.code}>
                  <Link to={`/client/${r.code}`} className="card flex items-center justify-between hover:border-gold/60">
                    <span>
                      <span className="block font-semibold">{r.clinic.name || r.patientName}</span>
                      <span className="text-[12px] text-ink-secondary" dir="ltr">
                        {r.code}
                      </span>
                    </span>
                    <span className="text-[12px] text-ink-tertiary">
                      {t.client.updated}: {formatDate(r.updatedAt, lang).split(' (')[0]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <p className="mt-8 flex items-center justify-center gap-2 text-[12px] text-ink-tertiary">
          <ShieldCheck size={16} /> {t.home.privacy}
        </p>
      </Page>
    </>
  );
}
