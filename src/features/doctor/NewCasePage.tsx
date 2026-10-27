import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ETHNIC_NORM_DEFAULT } from '../../analysis/norms';
import { SERVICES, requiredViews } from '../../capture/services';
import { BottomBar, Button, Chip, Field, Header, Notice, Page, Section } from '../../components/ui';
import { db } from '../../db/db';
import { createCase, createPatient } from '../../db/repo';
import type { Patient, Sex } from '../../db/types';
import { useBi, useNum, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';

const NORMS = ['middle-eastern', 'caucasian', 'east-asian', 'african'] as const;

export function NewCasePage() {
  const t = useT();
  const bi = useBi();
  const num = useNum();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const existingId = params.get('patient');
  const existing = useLive(async () => (existingId ? db.patients.get(existingId) : undefined), [existingId]);

  const [name, setName] = useState('');
  const [fileNo, setFileNo] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<Sex>('female');
  const [phone, setPhone] = useState('');
  const [norm, setNorm] = useState<string>(ETHNIC_NORM_DEFAULT);
  const [services, setServices] = useState<string[]>(['full-analysis']);
  const [busy, setBusy] = useState(false);

  const year = Number(existing?.birthYear ?? birthYear);
  const age = year > 1900 ? new Date().getFullYear() - year : null;
  const under18 = age !== null && age < 18;
  const valid = (existing || (name.trim() && fileNo.trim() && age !== null)) && !under18 && services.length > 0;
  const views = requiredViews(services);

  const submit = async () => {
    setBusy(true);
    try {
      const patient: Patient =
        existing ??
        (await createPatient({ displayName: name.trim(), fileNo: fileNo.trim(), birthYear: year, sex, phone: phone.trim() || undefined, ethnicityNorm: norm }));
      const c = await createCase(patient, services);
      nav(`/doctor/case/${c.id}/intake`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title={existing ? `${t.patient.newCase} — ${existing.displayName}` : t.patient.newTitle} back="/doctor" />
      <Page>
        {!existing && (
          <Section title={t.patient.newTitle}>
            <div className="card grid gap-3 sm:grid-cols-2">
              <Field label={t.patient.name}>
                <input className="w-full" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </Field>
              <Field label={t.patient.fileNo}>
                <input className="w-full" value={fileNo} onChange={(e) => setFileNo(e.target.value)} dir="ltr" />
              </Field>
              <Field label={t.patient.birthYear}>
                <input className="w-full" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} dir="ltr" placeholder="1985" />
              </Field>
              <Field label={t.patient.phone}>
                <input className="w-full" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
              </Field>
              <div className="sm:col-span-2">
                <span className="label">{t.patient.sex}</span>
                <div className="flex gap-2">
                  {(['female', 'male', 'other'] as const).map((s) => (
                    <Chip key={s} active={sex === s} onClick={() => setSex(s)}>
                      {t.patient.sexes[s]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="label">{t.patient.norm}</span>
                <div className="flex flex-wrap gap-2">
                  {NORMS.map((n) => (
                    <Chip key={n} active={norm === n} onClick={() => setNorm(n)}>
                      {t.patient.norms[n]}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        )}
        {under18 && <Notice tone="danger">{t.patient.under18}</Notice>}

        <Section title={t.patient.services}>
          <p className="mb-2 text-[13px] text-ink-secondary">{t.patient.servicesHint}</p>
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <Chip
                key={s.id}
                active={services.includes(s.id)}
                onClick={() => setServices((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
              >
                {bi(s.label)} · {num(s.views.length)}
              </Chip>
            ))}
          </div>
          <div className="mt-3">
            <Notice tone="gold">{t.capture.required(num(0), num(views.length))}</Notice>
          </div>
        </Section>
      </Page>
      <BottomBar>
        <Button variant="gold" className="flex-1" disabled={!valid || busy} onClick={() => void submit()}>
          {t.patient.create}
        </Button>
      </BottomBar>
    </>
  );
}
