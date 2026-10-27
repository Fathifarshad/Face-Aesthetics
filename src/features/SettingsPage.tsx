import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BottomBar, Button, Chip, Field, Header, Notice, Page, Section } from '../components/ui';
import { getSettings, saveSettings } from '../db/db';
import type { ClinicSettings } from '../db/types';
import { useBi, useT } from '../i18n';
import { contrastOnWhite } from '../lib/color';
import { TREATMENTS, type Modality } from '../plan/data/treatments';
import { useApp } from '../store/app';

const MODALITIES = [...new Set(TREATMENTS.map((o) => o.modality))] as Modality[];

export function SettingsPage() {
  const t = useT();
  const bi = useBi();
  const { lang, setLang } = useApp();
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
  const text = (key: keyof ClinicSettings, label: string, ltr = false) => (
    <Field label={label}>
      <input className="w-full" value={String(s[key] ?? '')} onChange={(e) => set({ [key]: e.target.value })} dir={ltr ? 'ltr' : undefined} />
    </Field>
  );
  const contrast = contrastOnWhite(s.accent);

  return (
    <>
      <Header title={t.settings.title} back />
      <Page>
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

        <Section title={t.settings.safety}>
          <div className="card grid gap-3 sm:grid-cols-2">
            <Field label={t.settings.maxHighRisk}>
              <input
                className="w-full"
                inputMode="numeric"
                value={s.maxHighRiskPerSession}
                onChange={(e) => set({ maxHighRiskPerSession: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1) })}
                dir="ltr"
              />
            </Field>
            <Field label={t.settings.retention}>
              <input
                className="w-full"
                inputMode="numeric"
                value={s.retentionMonths}
                onChange={(e) => set({ retentionMonths: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                dir="ltr"
              />
            </Field>
          </div>
        </Section>

        <Section title={t.settings.aftercare}>
          <p className="mb-2 text-[13px] text-ink-secondary">{t.settings.aftercareHint}</p>
          <div className="flex flex-col gap-3">
            {MODALITIES.map((m) => (
              <Field key={m} label={t.plan.modality[m] ?? m}>
                <textarea className="w-full" rows={3} value={s.aftercare[m] ?? ''} onChange={(e) => set({ aftercare: { ...s.aftercare, [m]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Section>

        <Section title={t.settings.prices}>
          <div className="card flex flex-col gap-2">
            {TREATMENTS.map((o) => (
              <label key={o.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-[13px]">{bi(o.title)}</span>
                <input
                  className="w-32"
                  inputMode="numeric"
                  value={s.prices[o.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    const prices = { ...s.prices };
                    if (v) prices[o.id] = Number(v);
                    else delete prices[o.id];
                    set({ prices });
                  }}
                  dir="ltr"
                  aria-label={bi(o.title)}
                />
              </label>
            ))}
          </div>
        </Section>

        <Link to="/dev/inspector" className="text-[13px] text-ink-tertiary underline">
          {t.settings.dev}
        </Link>
      </Page>
      <BottomBar>
        <Button
          variant="gold"
          className="flex-1"
          onClick={async () => {
            await saveSettings(s);
            setSaved(true);
          }}
        >
          {saved ? t.app.saved : t.app.save}
        </Button>
      </BottomBar>
    </>
  );
}
