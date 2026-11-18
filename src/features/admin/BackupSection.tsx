import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, Section, Toggle } from '../../components/ui';
import { applyRestore, defaultInclude, exportBackup, prepareRestore, type PreparedRestore } from '../../db/backup';
import { BackupFormatError } from '../../db/backupFile';
import { MIN_PASSPHRASE_LENGTH, WrongSecretError } from '../../db/crypto';
import { formatDate, useNum, useT } from '../../i18n';
import { useApp } from '../../store/app';
import { shareFile } from '../../share/exchange';

type Note = { tone: 'danger' | 'primary' | 'warn'; text: string };

/**
 * Release 1.1 R1: the whole doctor side of the device in one password-encrypted file, and a restore that merges.
 * The file leaves only through the system share sheet or a download the doctor starts; it is encrypted before.
 */
export function BackupSection() {
  const t = useT();
  const b = t.admin.backup;
  const num = useNum();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [makeNote, setMakeNote] = useState<Note | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [restorePass, setRestorePass] = useState('');
  const [restoreNotes, setRestoreNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState<'make' | 'check' | 'restore' | null>(null);
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const lang = useApp((st) => st.lang);

  const make = async (e: FormEvent) => {
    e.preventDefault();
    if (first.length < MIN_PASSPHRASE_LENGTH) return setMakeNote({ tone: 'danger', text: t.vault.tooShort(num(MIN_PASSPHRASE_LENGTH)) });
    if (first !== second) return setMakeNote({ tone: 'danger', text: t.vault.mismatch });
    setBusy('make');
    setMakeNote(null);
    try {
      const out = await exportBackup(first);
      setFirst('');
      setSecond('');
      await shareFile(out);
      setMakeNote({ tone: 'primary', text: b.made(out.name) });
    } finally {
      setBusy(null);
    }
  };

  /** Step 1: open the file and show where each patient stands. Nothing is written. */
  const check = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy('check');
    setRestoreNotes([]);
    try {
      const p = await prepareRestore(file, restorePass);
      setRestorePass('');
      setPrepared(p);
      setInclude(defaultInclude(p.review));
    } catch (err) {
      if (err instanceof WrongSecretError) setRestoreNotes([{ tone: 'danger', text: b.wrong }]);
      else if (err instanceof BackupFormatError) setRestoreNotes([{ tone: 'danger', text: err.reason === 'not-backup' ? b.notBackup : b[err.reason] }]);
      else throw err;
    } finally {
      setBusy(null);
    }
  };

  /** Step 2: merge the ticked patients. */
  const apply = async () => {
    if (!prepared) return;
    setBusy('restore');
    try {
      const c = await applyRestore(prepared, include);
      setPrepared(null);
      setRestoreNotes([
        { tone: 'primary', text: b.restored(num(c.added), num(c.updated)) },
        ...(c.skippedPatients ? [{ tone: 'warn' as const, text: b.skipped(num(c.skippedPatients)) }] : []),
      ]);
    } finally {
      setBusy(null);
    }
  };

  const tick = (id: string, on: boolean) => {
    const next = new Set(include);
    if (on) next.add(id);
    else next.delete(id);
    setInclude(next);
  };
  const erased = prepared?.review.filter((r) => r.status === 'erased') ?? [];

  const password = (label: string, value: string, onChange: (v: string) => void, autoComplete: string) => (
    <Field label={label}>
      <input className="w-full" type="password" dir="ltr" autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );

  return (
    <>
      <Section title={b.title}>
        <form className="card flex flex-col gap-3" onSubmit={make} data-backup="make">
          <p className="text-control text-ink-2">{b.body}</p>
          {password(b.password, first, setFirst, 'new-password')}
          {password(b.repeat, second, setSecond, 'new-password')}
          <Notice tone="warn">{b.warn}</Notice>
          {makeNote && <Notice tone={makeNote.tone}>{makeNote.text}</Notice>}
          <Button type="submit" variant="primary" disabled={busy !== null || !first}>
            {busy === 'make' ? b.making : b.make}
          </Button>
        </form>
      </Section>
      <Section title={b.restoreTitle}>
        <form className="card flex flex-col gap-3" onSubmit={check} data-backup="restore">
          <p className="text-control text-ink-2">{b.restoreBody}</p>
          <Field label={b.file}>
            <input
              type="file"
              className="w-full py-2"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPrepared(null);
                setRestoreNotes([]);
              }}
            />
          </Field>
          {password(b.password, restorePass, setRestorePass, 'off')}
          {restoreNotes.map((n) => (
            <Notice key={n.text} tone={n.tone}>
              {n.text}
            </Notice>
          ))}
          {!prepared && (
            <Button type="submit" disabled={busy !== null || !file || !restorePass}>
              {busy === 'check' ? b.checking : b.check}
            </Button>
          )}
        </form>
        {prepared && (
          <div className="card mt-3 flex flex-col gap-3" data-backup="review">
            <h3 className="text-body font-bold">{b.reviewTitle}</h3>
            <p className="text-control">
              {b.reviewFile(formatDate(prepared.totals.createdAt, lang), num(prepared.totals.patients), num(prepared.totals.cases), num(prepared.totals.photos))}
            </p>
            <p className="text-control text-ink-2">{b.reviewHelp}</p>
            <Notice tone="neutral">{b.untouched}</Notice>
            <Notice tone="neutral">{b.clientNote}</Notice>
            {erased.length > 0 && (
              <Toggle
                checked={erased.every((r) => include.has(r.id))}
                onChange={(on) => {
                  const next = new Set(include);
                  for (const r of erased) {
                    if (on) next.add(r.id);
                    else next.delete(r.id);
                  }
                  setInclude(next);
                }}
                label={b.restoreDeleted}
              />
            )}
            <ul className="flex flex-col">
              {prepared.review.map((r) => (
                <li key={r.id} className="border-b border-border/50 last:border-0" data-review={r.status}>
                  <label className="flex min-h-touch cursor-pointer items-start gap-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-6 w-6 shrink-0 accent-primary"
                      checked={include.has(r.id)}
                      onChange={(e) => tick(r.id, e.target.checked)}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-bold">
                        {r.name} <bdi className="text-caption font-normal text-ink-2">{r.fileNo}</bdi>
                      </span>
                      <span className="text-caption text-ink-2">{b.patientLine(num(r.cases), num(r.photos))}</span>
                      <span className={`text-caption ${r.status === 'new' || r.status === 'here' ? 'text-ink-2' : 'text-risk-fg'}`}>
                        {r.status === 'code-taken' ? b.codeTaken(r.code, r.takenBy ?? '') : b.status[r.status]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" disabled={busy !== null} onClick={() => void apply()}>
                {busy === 'restore' ? b.restoring : b.apply(num(include.size))}
              </Button>
              <Button disabled={busy !== null} onClick={() => setPrepared(null)}>
                {b.cancel}
              </Button>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
