import { Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { RecoveryCode } from '../../app/VaultGate';
import { BottomBar, Button, Chip, Field, Header, Notice, Page, Section } from '../../components/ui';
import { MIN_PASSPHRASE_LENGTH, WrongSecretError } from '../../db/crypto';
import { db, getSettings, saveSettings } from '../../db/db';
import type { ClinicSettings } from '../../db/types';
import { FILLER_TYPES, SESSION_MODALITIES, type Tariff } from '../../data/estimates';
import { changePassphrase, lock, renewRecoveryCode } from '../../db/vault';
import { useNum, useT } from '../../i18n';
import { contrastOnWhite } from '../../lib/color';
import { useLive } from '../../lib/hooks';
import { TREATMENTS, type Modality } from '../../plan/data/treatments';
import { useApp } from '../../store/app';

const MODALITIES = [...new Set(TREATMENTS.map((o) => o.modality))] as Modality[];
const TABS = ['security', 'clinic', 'pricing', 'aftercare', 'data', 'tools'] as const;
type Tab = (typeof TABS)[number];
/** Tabs whose fields are saved with the button at the bottom. */
const SETTINGS_TABS: readonly Tab[] = ['clinic', 'pricing', 'aftercare', 'data'];

/**
 * The doctor's admin panel: security of the device vault, clinic profile, pricing, aftercare texts,
 * data on this device and tools. One doctor, one device — there are no user accounts in this phase.
 */
export function AdminPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('security');
  const [s, setS] = useState<ClinicSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void getSettings().then(setS);
  }, []);
  if (!s) return null;
  const set = (patch: Partial<ClinicSettings>) => {
    setSaved(false);
    setS({ ...s, ...patch });
  };

  return (
    <>
      <Header title={t.admin.title} back="/doctor" />
      <Page>
        <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label={t.admin.tabsLabel}>
          {TABS.map((id) => (
            <Chip key={id} active={tab === id} onClick={() => setTab(id)} className="shrink-0">
              {t.admin.tabs[id]}
            </Chip>
          ))}
        </nav>

        {tab === 'security' && <SecurityTab />}
        {tab === 'clinic' && <ClinicTab s={s} set={set} />}
        {tab === 'pricing' && <PricingTab s={s} set={set} />}
        {tab === 'aftercare' && <AftercareTab s={s} set={set} />}
        {tab === 'data' && <DataTab s={s} set={set} />}
        {tab === 'tools' && <ToolsTab />}
      </Page>
      {SETTINGS_TABS.includes(tab) && (
        <BottomBar>
          <Button
            variant="primary"
            className="flex-1"
            onClick={async () => {
              await saveSettings(s);
              setSaved(true);
            }}
          >
            {saved ? t.app.saved : t.admin.saveSettings}
          </Button>
        </BottomBar>
      )}
    </>
  );
}

type TabProps = { s: ClinicSettings; set: (patch: Partial<ClinicSettings>) => void };

function SecurityTab() {
  const t = useT();
  const num = useNum();
  const [current, setCurrent] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [changeNote, setChangeNote] = useState<{ tone: 'danger' | 'primary'; text: string } | null>(null);
  const [renewPass, setRenewPass] = useState('');
  const [renewError, setRenewError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (first.length < MIN_PASSPHRASE_LENGTH) return setChangeNote({ tone: 'danger', text: t.vault.tooShort(num(MIN_PASSPHRASE_LENGTH)) });
    if (first !== second) return setChangeNote({ tone: 'danger', text: t.vault.mismatch });
    setBusy(true);
    try {
      await changePassphrase(current, first);
      setCurrent('');
      setFirst('');
      setSecond('');
      setChangeNote({ tone: 'primary', text: t.admin.changed });
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setChangeNote({ tone: 'danger', text: t.vault.wrong });
    } finally {
      setBusy(false);
    }
  };

  const renew = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setRenewError(null);
    try {
      setCode(await renewRecoveryCode(renewPass));
      setRenewPass('');
    } catch (err) {
      if (!(err instanceof WrongSecretError)) throw err;
      setRenewError(t.vault.wrong);
    } finally {
      setBusy(false);
    }
  };

  const password = (label: string, value: string, onChange: (v: string) => void, autoComplete: string) => (
    <Field label={label}>
      <input className="w-full" type="password" dir="ltr" autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );

  return (
    <>
      <div className="mb-5 flex flex-col gap-2">
        <Notice tone="primary">{t.admin.securityState}</Notice>
        <Notice tone="warn">{t.admin.notEncrypted}</Notice>
      </div>

      <Section title={t.admin.lockTitle}>
        <div className="card flex flex-col gap-3">
          <p className="text-control text-ink-2">{t.admin.lockBody}</p>
          <Button onClick={lock}>
            <Lock size={18} aria-hidden />
            {t.vault.lockNow}
          </Button>
        </div>
      </Section>

      <Section title={t.admin.changeTitle}>
        <form className="card flex flex-col gap-3" onSubmit={change}>
          {password(t.vault.current, current, setCurrent, 'current-password')}
          {password(t.vault.newPassphrase, first, setFirst, 'new-password')}
          {password(t.vault.repeatNew, second, setSecond, 'new-password')}
          {changeNote && <Notice tone={changeNote.tone}>{changeNote.text}</Notice>}
          <Button type="submit" disabled={busy || !current}>
            {t.admin.change}
          </Button>
        </form>
      </Section>

      <Section title={t.admin.renewTitle}>
        <form className="card flex flex-col gap-3" onSubmit={renew}>
          <p className="text-control text-ink-2">{t.admin.renewBody}</p>
          {password(t.vault.current, renewPass, setRenewPass, 'current-password')}
          {renewError && <Notice tone="danger">{renewError}</Notice>}
          {code && (
            <>
              <RecoveryCode code={code} />
              <Notice tone="warn">{t.vault.codeWarning}</Notice>
            </>
          )}
          <Button type="submit" disabled={busy || !renewPass}>
            {t.admin.renew}
          </Button>
        </form>
      </Section>
    </>
  );
}

function ClinicTab({ s, set }: TabProps) {
  const t = useT();
  const text = (key: 'doctorName' | 'doctorTitle' | 'licence' | 'clinicName' | 'clinicPhone' | 'clinicAddress' | 'footer', label: string, ltr = false) => (
    <Field label={label}>
      <input className="w-full" value={s[key]} onChange={(e) => set({ [key]: e.target.value })} dir={ltr ? 'ltr' : undefined} />
    </Field>
  );
  const contrast = contrastOnWhite(s.accent);
  return (
    <>
      <Section title={t.settings.doctor}>
        <div className="card grid gap-3 sm:grid-cols-2">
          {text('doctorName', t.settings.doctorName)}
          {text('doctorTitle', t.settings.doctorTitle)}
          {text('licence', t.settings.licence, true)}
        </div>
      </Section>
      <Section title={t.settings.clinic}>
        <div className="card grid gap-3 sm:grid-cols-2">
          {text('clinicName', t.settings.clinicName)}
          {text('clinicPhone', t.settings.clinicPhone, true)}
          {text('clinicAddress', t.settings.clinicAddress)}
          {text('footer', t.settings.footer)}
          <Field label={t.settings.accent}>
            <input type="color" className="h-11 w-full p-1" value={s.accent} onChange={(e) => set({ accent: e.target.value })} />
          </Field>
          <Field label={t.settings.logo}>
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="w-full py-2"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => set({ logo: r.result as string });
                r.readAsDataURL(f);
              }}
            />
          </Field>
          {contrast !== null && contrast < 4.5 && (
            <div className="sm:col-span-2">
              <Notice tone="warn">{t.settings.accentFail}</Notice>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

function PricingTab({ s, set }: TabProps) {
  const t = useT();
  const tariff = s.tariff;
  const put = (patch: Partial<Tariff>) => set({ tariff: { ...tariff, ...patch } });
  /** Whole prices; an empty field removes the price («تعرفه وارد نشده»). */
  const price = (label: string, value: number | undefined, onChange: (v: number | undefined) => void, testId: string) => (
    <label className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-control">{label}</span>
      <input
        className="w-36"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '');
          onChange(v ? Number(v) : undefined);
        }}
        dir="ltr"
        aria-label={label}
        data-tariff={testId}
      />
    </label>
  );
  const size = (label: string, value: number, onChange: (v: number) => void, decimal: boolean) => (
    <Field label={label}>
      <input
        className="w-full"
        inputMode={decimal ? 'decimal' : 'numeric'}
        defaultValue={value}
        onChange={(e) => {
          const v = Number(e.target.value.replace(/[^\d.]/g, ''));
          if (Number.isFinite(v) && v > 0) onChange(v);
        }}
        dir="ltr"
      />
    </Field>
  );
  return (
    <>
      <Section title={t.settings.safety}>
        <div className="card">
          <Field label={t.settings.maxHighRisk}>
            <input
              className="w-full"
              inputMode="numeric"
              value={s.maxHighRiskPerSession}
              onChange={(e) => set({ maxHighRiskPerSession: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
              dir="ltr"
            />
          </Field>
        </div>
      </Section>
      <Section title={t.est.tariff}>
        <p className="mb-2 text-control text-ink-2">{t.est.tariffHint}</p>
        <div className="card flex flex-col gap-2">
          <Field label={t.est.currency}>
            <input className="w-full" value={tariff.currency} onChange={(e) => put({ currency: e.target.value })} />
          </Field>
          {FILLER_TYPES.map((k) =>
            price(t.est.fillerTypes[k], tariff.filler[k], (v) => {
              const filler = { ...tariff.filler };
              if (v === undefined) delete filler[k];
              else filler[k] = v;
              put({ filler });
            }, `filler.${k}`),
          )}
          {price(t.est.toxinUnit, tariff.toxinUnit, (v) => put({ toxinUnit: v }), 'toxinUnit')}
          {price(t.est.thread, tariff.thread, (v) => put({ thread: v }), 'thread')}
          {SESSION_MODALITIES.map((m) =>
            price(t.est.perSession(t.options.modality[m]), tariff.session[m], (v) => {
              const session = { ...tariff.session };
              if (v === undefined) delete session[m];
              else session[m] = v;
              put({ session });
            }, `session.${m}`),
          )}
        </div>
      </Section>
      <Section title={t.est.sizes}>
        <div className="card grid gap-3 sm:grid-cols-2">
          {size(t.est.syringeMl, tariff.syringeMl, (v) => put({ syringeMl: v }), true)}
          {size(t.est.vialUnits, tariff.vialUnits, (v) => put({ vialUnits: Math.round(v) }), false)}
        </div>
      </Section>
    </>
  );
}

function AftercareTab({ s, set }: TabProps) {
  const t = useT();
  return (
    <Section title={t.settings.aftercare}>
      <p className="mb-2 text-control text-ink-2">{t.settings.aftercareHint}</p>
      <div className="flex flex-col gap-3">
        {MODALITIES.map((m) => (
          <Field key={m} label={t.plan.modality[m] ?? m}>
            <textarea className="w-full" rows={3} value={s.aftercare[m] ?? ''} onChange={(e) => set({ aftercare: { ...s.aftercare, [m]: e.target.value } })} />
          </Field>
        ))}
      </div>
    </Section>
  );
}

function DataTab({ s, set }: TabProps) {
  const t = useT();
  const num = useNum();
  const counts = useLive(async () => {
    const [patients, cases, photos, simulations] = await Promise.all([db.patients.count(), db.cases.count(), db.photos.count(), db.simulations.count()]);
    return { patients, cases, photos, simulations };
  }, []);
  const [usedMb, setUsedMb] = useState<number | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setUsedMb(e.usage === undefined ? null : e.usage / (1024 * 1024)))
      .catch(() => setUsedMb(null));
  }, [counts]);

  return (
    <>
      <Section title={t.admin.counts}>
        <div className="grid grid-cols-2 gap-2">
          {(['patients', 'cases', 'photos', 'simulations'] as const).map((k) => (
            <div key={k} className="card text-center">
              <bdi className="block text-title font-bold">{counts ? num(counts[k]) : '—'}</bdi>
              <span className="text-caption text-ink-2">{t.admin[k]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-control text-ink-2">
          {t.admin.storage}: {usedMb === null ? t.admin.storageUnknown : <bdi>{num(usedMb, 1)} MB</bdi>}
        </p>
        <p className="mt-1 text-control text-ink-2">{t.admin.deleteHint}</p>
      </Section>
      <Section title={t.settings.retention}>
        <div className="card flex flex-col gap-2">
          <Field label={t.settings.retention}>
            <input
              className="w-full"
              inputMode="numeric"
              value={s.retentionMonths}
              onChange={(e) => set({ retentionMonths: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              dir="ltr"
            />
          </Field>
          <Notice tone="warn">{t.admin.retentionNote}</Notice>
        </div>
      </Section>
    </>
  );
}

function ToolsTab() {
  const t = useT();
  const { lang, setLang } = useApp();
  return (
    <>
      <Section title={t.settings.language}>
        <div className="flex gap-2">
          <Chip active={lang === 'fa'} onClick={() => setLang('fa')}>
            فارسی
          </Chip>
          <Chip active={lang === 'en'} onClick={() => setLang('en')}>
            English
          </Chip>
        </div>
      </Section>
      <div className="flex flex-col gap-1">
        <Link to="/dev/regions" className="flex min-h-touch items-center text-control text-muted underline">
          {t.regions.open}
        </Link>
        <Link to="/dev/inspector" className="flex min-h-touch items-center text-control text-muted underline">
          {t.settings.dev}
        </Link>
      </div>
    </>
  );
}
