import { useState, type FormEvent } from 'react';
import { Button, Field, Notice, Section } from '../../components/ui';
import { exportBackup, restoreBackup } from '../../db/backup';
import { BackupFormatError } from '../../db/backupFile';
import { MIN_PASSPHRASE_LENGTH, WrongSecretError } from '../../db/crypto';
import { useNum, useT } from '../../i18n';
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
  const [busy, setBusy] = useState<'make' | 'restore' | null>(null);

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

  const restore = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy('restore');
    setRestoreNotes([]);
    try {
      const c = await restoreBackup(file, restorePass);
      setRestorePass('');
      setRestoreNotes([
        { tone: 'primary', text: b.restored(num(c.added), num(c.updated)) },
        ...(c.skippedPatients ? [{ tone: 'warn' as const, text: b.skipped(num(c.skippedPatients)) }] : []),
      ]);
    } catch (err) {
      if (err instanceof WrongSecretError) setRestoreNotes([{ tone: 'danger', text: b.wrong }]);
      else if (err instanceof BackupFormatError) setRestoreNotes([{ tone: 'danger', text: err.reason === 'not-backup' ? b.notBackup : b[err.reason] }]);
      else throw err;
    } finally {
      setBusy(null);
    }
  };

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
        <form className="card flex flex-col gap-3" onSubmit={restore} data-backup="restore">
          <p className="text-control text-ink-2">{b.restoreBody}</p>
          <Field label={b.file}>
            <input
              type="file"
              className="w-full py-2"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
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
          <Button type="submit" disabled={busy !== null || !file || !restorePass}>
            {busy === 'restore' ? b.restoring : b.restore}
          </Button>
        </form>
      </Section>
    </>
  );
}
