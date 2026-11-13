import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Button, Field, LangToggle, Notice } from '../components/ui';
import { isRecoveryCode, MIN_PASSPHRASE_LENGTH, WrongSecretError } from '../db/crypto';
import { createVault, dismissRecoveryCode, initVault, lock, recoverWithCode, unlock, useVault } from '../db/vault';
import { useNum, useT } from '../i18n';

/** docs/PRD.md §11: the doctor area locks itself after 5 minutes without activity. */
export const IDLE_LOCK_MS = 5 * 60 * 1000;
const IDLE_CHECK_MS = 15 * 1000;

/**
 * Gate in front of everything that shows patient data: first run asks for a passphrase,
 * later visits ask to unlock, and a just-issued recovery code is shown once before the app.
 */
export function VaultGate() {
  const status = useVault((s) => s.status);
  const recoveryCode = useVault((s) => s.recoveryCode);
  useEffect(() => {
    void initVault();
  }, []);

  if (status === 'loading') return null;
  if (recoveryCode) return <RecoveryCodeScreen code={recoveryCode} />;
  if (status === 'none') return <SetupScreen />;
  if (status === 'locked') return <UnlockScreen />;
  return (
    <>
      <IdleLock />
      <Outlet />
    </>
  );
}

/** Locks after IDLE_LOCK_MS without pointer or keyboard activity, also when the tab comes back after that long. */
function IdleLock() {
  useEffect(() => {
    let last = Date.now();
    const touch = () => (last = Date.now());
    const check = () => {
      if (Date.now() - last >= IDLE_LOCK_MS) lock();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, IDLE_CHECK_MS);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}

function Frame({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-4">
      <div className="flex items-center justify-between">
        <span className="brand-text text-title font-bold">{t.app.name}</span>
        <LangToggle />
      </div>
      <div className="mt-10 flex flex-col gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-tint text-primary">{icon}</span>
        <h1 className="text-title font-bold">{title}</h1>
        <p className="text-body text-ink-2">{body}</p>
        {children}
      </div>
    </main>
  );
}

function PassphraseFields({
  first,
  second,
  onFirst,
  onSecond,
  labels,
}: {
  first: string;
  second: string;
  onFirst: (v: string) => void;
  onSecond: (v: string) => void;
  labels: [string, string];
}) {
  return (
    <>
      <Field label={labels[0]}>
        <input className="w-full" type="password" dir="ltr" autoComplete="new-password" value={first} onChange={(e) => onFirst(e.target.value)} />
      </Field>
      <Field label={labels[1]}>
        <input className="w-full" type="password" dir="ltr" autoComplete="new-password" value={second} onChange={(e) => onSecond(e.target.value)} />
      </Field>
    </>
  );
}

/** Returns the message for a new passphrase that cannot be used, or null when it is fine. */
function useNewPassphraseCheck() {
  const t = useT();
  const num = useNum();
  return (first: string, second: string): string | null =>
    first.length < MIN_PASSPHRASE_LENGTH ? t.vault.tooShort(num(MIN_PASSPHRASE_LENGTH)) : first !== second ? t.vault.mismatch : null;
}

function SetupScreen() {
  const t = useT();
  const check = useNewPassphraseCheck();
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = check(first, second);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await createVault(first);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame icon={<ShieldCheck size={24} aria-hidden />} title={t.vault.setupTitle} body={t.vault.setupBody}>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <PassphraseFields first={first} second={second} onFirst={setFirst} onSecond={setSecond} labels={[t.vault.passphrase, t.vault.repeat]} />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" className="h-[52px] text-cta" disabled={busy}>
          {busy ? t.vault.working : t.vault.create}
        </Button>
      </form>
    </Frame>
  );
}

function UnlockScreen() {
  const t = useT();
  const check = useNewPassphraseCheck();
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [code, setCode] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>, wrong: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setError(wrong);
    } finally {
      setBusy(false);
    }
  };

  const submitPassphrase = (e: FormEvent) => {
    e.preventDefault();
    void run(() => unlock(passphrase), t.vault.wrong);
  };

  const submitRecovery = (e: FormEvent) => {
    e.preventDefault();
    if (!isRecoveryCode(code)) return setError(t.vault.wrongCode);
    const problem = check(first, second);
    if (problem) return setError(problem);
    void run(() => recoverWithCode(code, first), t.vault.wrongCode);
  };

  const switchTo = (next: typeof mode) => {
    setMode(next);
    setError(null);
  };

  if (mode === 'recovery')
    return (
      <Frame icon={<KeyRound size={24} aria-hidden />} title={t.vault.recoverTitle} body={t.vault.recoverBody}>
        <form className="flex flex-col gap-3" onSubmit={submitRecovery}>
          <Field label={t.vault.recoveryCode}>
            <input className="w-full" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <PassphraseFields first={first} second={second} onFirst={setFirst} onSecond={setSecond} labels={[t.vault.newPassphrase, t.vault.repeatNew]} />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" className="h-[52px] text-cta" disabled={busy}>
            {busy ? t.vault.working : t.vault.recover}
          </Button>
          <Button onClick={() => switchTo('passphrase')}>{t.vault.backToUnlock}</Button>
        </form>
      </Frame>
    );

  return (
    <Frame icon={<Lock size={24} aria-hidden />} title={t.vault.lockedTitle} body={t.vault.lockedBody}>
      <form className="flex flex-col gap-3" onSubmit={submitPassphrase}>
        <Field label={t.vault.passphrase}>
          <input
            className="w-full"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            autoFocus
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" className="h-[52px] text-cta" disabled={busy || !passphrase}>
          {busy ? t.app.loading : t.vault.unlock}
        </Button>
        <button type="button" className="min-h-touch text-control text-primary-on-tint underline" onClick={() => switchTo('recovery')}>
          {t.vault.forgot}
        </button>
      </form>
    </Frame>
  );
}

/** Shows a just-issued recovery code once. The app stays hidden until the doctor confirms it was written down. */
export function RecoveryCodeScreen({ code }: { code: string }) {
  const t = useT();
  const [noted, setNoted] = useState(false);
  return (
    <Frame icon={<KeyRound size={24} aria-hidden />} title={t.vault.codeTitle} body={t.vault.codeBody}>
      <RecoveryCode code={code} />
      <Notice tone="warn">{t.vault.codeWarning}</Notice>
      <label className="flex min-h-touch cursor-pointer items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={noted} onChange={(e) => setNoted(e.target.checked)} />
        <span>{t.vault.codeConfirm}</span>
      </label>
      <Button variant="primary" className="h-[52px] text-cta" disabled={!noted} onClick={dismissRecoveryCode}>
        {t.vault.enter}
      </Button>
    </Frame>
  );
}

export function RecoveryCode({ code }: { code: string }) {
  const t = useT();
  return (
    <output aria-label={t.vault.recoveryCode} dir="ltr" className="block select-all rounded-card border border-primary bg-primary-tint p-4 text-center text-title font-bold tracking-wider text-primary-on-tint">
      <bdi>{code}</bdi>
    </output>
  );
}
