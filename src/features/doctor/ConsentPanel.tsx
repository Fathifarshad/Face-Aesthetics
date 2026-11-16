import { CheckCircle2, CircleDashed, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { SignaturePad } from '../../components/SignaturePad';
import { Button, Chip, Header, Notice, Page, Tag, Toggle } from '../../components/ui';
import { activeConsent } from '../../data/consentGate';
import type { Consent, ConsentScope, PhotoUse } from '../../data/types';
import { db, uid } from '../../db/db';
import { addConsent, revokeConsent } from '../../db/images';
import { formatDate, useT } from '../../i18n';
import { useLive } from '../../lib/hooks';
import { useApp } from '../../store/app';
import { useConsents } from './useConsents';

const SCOPES: readonly ConsentScope[] = ['analysis', 'cloudRender', 'beforeAfter'];
const USES: readonly PhotoUse[] = ['internal', 'education', 'public'];

/**
 * PRD F8.3 and F8.6: one card per consent level, each signed with the patient's name, the date and a touch
 * signature, and revocable. Revoked consents stay in the history.
 */
export function ConsentPanel({ patientId, scopes = SCOPES }: { patientId: string; scopes?: readonly ConsentScope[] }) {
  const consents = useConsents(patientId);
  if (!consents) return null;
  return (
    <div className="flex flex-col gap-3">
      {scopes.map((s) => (
        <ConsentCard key={s} patientId={patientId} scope={s} consents={consents} />
      ))}
    </div>
  );
}

function ConsentCard({ patientId, scope, consents }: { patientId: string; scope: ConsentScope; consents: Consent[] }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const date = (ts: number) => formatDate(ts, lang).split(' (')[0]!;
  const active = activeConsent(consents, scope);
  const past = consents.filter((c) => c.scope === scope && c.revokedAt).reverse();
  const [form, setForm] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="card" data-consent={scope} data-state={active ? 'active' : 'none'}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{t.consent.scope[scope]}</h3>
        {active ? (
          <Tag tone="ok">
            <CheckCircle2 size={13} /> {t.consent.active}
          </Tag>
        ) : (
          <Tag>
            <CircleDashed size={13} /> {t.consent.none}
          </Tag>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{t.consent.body[scope]}</p>

      {active && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <img src={active.signature} alt={t.consent.signature} className="h-12 w-28 rounded bg-paper object-contain" />
            <div className="min-w-0 text-[13px]">
              <div>{t.consent.signedBy(active.signedName, date(active.signedAt))}</div>
              {active.detail && (
                <div className="text-ink-2">
                  {t.consent.use[active.detail.use]} · {active.detail.maskEyes ? t.consent.eyesMasked : t.consent.eyesShown}
                </div>
              )}
            </div>
          </div>
          {confirm ? (
            <div className="flex flex-col gap-2">
              <Notice tone="warn">{t.consent.revokeConfirm}</Notice>
              <div className="flex gap-2">
                <Button
                  variant="soft"
                  onClick={() => {
                    setConfirm(false);
                    void revokeConsent(active.id);
                  }}
                >
                  <ShieldOff size={16} /> {t.consent.revokeYes}
                </Button>
                <Button onClick={() => setConfirm(false)}>{t.app.cancel}</Button>
              </div>
            </div>
          ) : (
            <div>
              <Button onClick={() => setConfirm(true)}>{t.consent.revoke}</Button>
            </div>
          )}
        </div>
      )}

      {!active && !form && (
        <div className="mt-3">
          <Button variant="primary" onClick={() => setForm(true)}>
            {t.consent.start}
          </Button>
        </div>
      )}
      {!active && form && <ConsentForm patientId={patientId} scope={scope} onDone={() => setForm(false)} />}

      {past.length > 0 && (
        <details className="mt-3 text-[12px] text-ink-2">
          <summary>{t.consent.history}</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {past.map((c) => (
              <li key={c.id}>
                {t.consent.signedBy(c.signedName, date(c.signedAt))}
                {c.detail && ` · ${t.consent.use[c.detail.use]}`} — {t.consent.revokedOn(date(c.revokedAt!))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ConsentForm({ patientId, scope, onDone }: { patientId: string; scope: ConsentScope; onDone: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const [name, setName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [use, setUse] = useState<PhotoUse>('internal');
  const [maskEyes, setMaskEyes] = useState(true);
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length >= 2 && !!signature && !busy;

  const submit = async () => {
    if (!signature) return;
    setBusy(true);
    try {
      await addConsent({
        id: uid(),
        patientId,
        scope,
        ...(scope === 'beforeAfter' ? { detail: { use, maskEyes } } : {}),
        signedName: name.trim(),
        signature,
        signedAt: Date.now(),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3">
      {scope === 'beforeAfter' && (
        <>
          <div>
            <span className="label">{t.consent.useLabel}</span>
            <div className="flex flex-wrap gap-2">
              {USES.map((u) => (
                <Chip key={u} active={use === u} onClick={() => setUse(u)}>
                  {t.consent.use[u]}
                </Chip>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-ink-2">{t.consent.useHint[use]}</p>
          </div>
          <Toggle label={t.consent.maskEyes} checked={maskEyes} onChange={setMaskEyes} />
        </>
      )}
      <label className="block">
        <span className="label">{t.consent.signedName}</span>
        <input className="w-full" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="text-[13px] text-ink-2">
        {t.consent.date}: <bdi>{formatDate(Date.now(), lang).split(' (')[0]}</bdi>
      </div>
      <div>
        <span className="label">{t.consent.signature}</span>
        <SignaturePad onChange={setSignature} />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" disabled={!ok} onClick={() => void submit()}>
          {t.consent.submit}
        </Button>
        <Button onClick={onDone}>{t.app.cancel}</Button>
      </div>
    </div>
  );
}

/** `/doctor/patient/:patientId/consent`: all three levels of one patient. */
export function ConsentPage() {
  const { patientId = '' } = useParams();
  const t = useT();
  const patient = useLive(async () => (await db.patients.get(patientId)) ?? null, [patientId]);
  if (patient === undefined) return null;
  return (
    <>
      <Header title={`${t.consent.title}${patient ? ` — ${patient.displayName}` : ''}`} back />
      <Page>
        <p className="mb-3 text-[13px] text-ink-2">{t.consent.intro}</p>
        <ConsentPanel patientId={patientId} />
      </Page>
    </>
  );
}
