import { Camera, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, Image as ImageIcon, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { processPhoto, type Processed } from '../capture/processPhoto';
import type { QcResult } from '../capture/qc';
import type { ViewDef } from '../capture/views';
import { useBi, useT } from '../i18n';
import { useObjectUrl } from '../lib/hooks';
import { FaceCanvas } from './FaceCanvas';
import { LiveCamera } from './LiveCamera';
import { PoseGlyph } from './PoseGlyph';
import { Button, Notice, Tag } from './ui';

export type SlotPhoto = { blob: Blob; lowQuality: boolean; qc: QcResult | null };

/**
 * One required view: guide (illustration + instructions), capture via in-app camera or gallery,
 * then an immediate confirmation step with automatic quality checks before saving.
 */
export function CaptureSlot({
  view,
  photo,
  ghost,
  onSave,
  defaultOpen = false,
}: {
  view: ViewDef;
  photo: SlotPhoto | null;
  ghost?: Blob | null;
  onSave: (p: Processed, lowQuality: boolean) => Promise<void>;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const bi = useBi();
  const [open, setOpen] = useState(defaultOpen);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Processed | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const thumb = useObjectUrl(photo?.blob);

  const handle = async (blob: Blob) => {
    setCamera(false);
    setBusy(true);
    try {
      setPending(await processPhoto(blob, view));
    } finally {
      setBusy(false);
    }
  };

  const save = async (lowQuality: boolean) => {
    if (!pending) return;
    await onSave(pending, lowQuality);
    setPending(null);
    setOpen(false);
  };

  const state = !photo ? 'missing' : photo.lowQuality ? 'low' : 'ok';

  return (
    <div className="card">
      <button type="button" className="flex w-full items-center gap-3 text-start" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {thumb ? (
          <img src={thumb} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-surface-2">
            <PoseGlyph view={view} size={44} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{bi(view.label)}</div>
          <div className="mt-1">
            {state === 'ok' && (
              <Tag tone="ok">
                <CheckCircle2 size={13} /> {t.capture.accepted}
              </Tag>
            )}
            {state === 'low' && (
              <Tag tone="warn">
                <CircleAlert size={13} /> {t.capture.lowQuality}
              </Tag>
            )}
            {state === 'missing' && (
              <Tag>
                <CircleDashed size={13} /> {t.capture.missing}
              </Tag>
            )}
          </div>
        </div>
        <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-surface-2 p-1.5">
              <PoseGlyph view={view} size={64} />
            </div>
            <div>
              <div className="text-[12px] font-semibold text-gold-ink">{t.capture.guide}</div>
              <p className="text-[13px] text-ink-secondary">{bi(view.guide)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="gold" className="flex-1" onClick={() => setCamera(true)} disabled={busy}>
              <Camera size={18} /> {photo ? t.capture.retake : t.capture.camera}
            </Button>
            <Button className="flex-1" onClick={() => file.current?.click()} disabled={busy}>
              <ImageIcon size={18} /> {t.capture.gallery}
            </Button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handle(f);
              }}
            />
          </div>
          {busy && <Notice tone="gold">{t.app.loading}</Notice>}
        </div>
      )}

      {camera && <LiveCamera view={view} ghost={ghost} onCapture={(b) => void handle(b)} onClose={() => setCamera(false)} />}
      {pending && (
        <ConfirmDialog
          view={view}
          processed={pending}
          onAccept={() => void save(false)}
          onUseAnyway={() => void save(true)}
          onRetake={() => {
            setPending(null);
            setCamera(true);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  view,
  processed,
  onAccept,
  onUseAnyway,
  onRetake,
  onCancel,
}: {
  view: ViewDef;
  processed: Processed;
  onAccept: () => void;
  onUseAnyway: () => void;
  onRetake: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const bi = useBi();
  const { qc } = processed;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg/95 backdrop-blur" role="dialog" aria-modal="true" aria-label={t.capture.confirmTitle}>
      <div className="mx-auto max-w-lg p-4">
        <h2 className="mb-1 text-[18px] font-bold">{t.capture.confirmTitle}</h2>
        <p className="mb-3 text-[13px] text-ink-secondary">{bi(view.label)}</p>
        <FaceCanvas blob={processed.blob} landmarks={processed.landmarks} overlay={{ landmarks: 'named' }} alt={bi(view.label)} />
        {processed.detectorError && (
          <div className="mt-3">
            <Notice tone="warn">{t.capture.detectorError}</Notice>
          </div>
        )}
        <ul className="mt-3 flex flex-col gap-1.5">
          {qc.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-[13px]">
              {c.pass === true && <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-label="pass" />}
              {c.pass === false && <XCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-label="fail" />}
              {c.pass === null && <CircleDashed size={18} className="mt-0.5 shrink-0 text-ink-tertiary" aria-label="n/a" />}
              <div>
                <span>{t.capture.checks[c.id]}</span>
                {c.value && <span className="ms-2 text-ink-tertiary">{c.value}</span>}
                {c.pass === false && c.hint && <div className="text-warn-ink">{t.capture.hints[c.hint]}</div>}
                {c.pass === null && <div className="text-ink-tertiary">{t.capture.manual}</div>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          {qc.pass ? (
            <Button variant="gold" onClick={onAccept}>
              <CheckCircle2 size={18} /> {t.capture.accept}
            </Button>
          ) : (
            <Button variant="soft" onClick={onUseAnyway}>
              <CircleAlert size={18} /> {t.capture.useAnyway}
            </Button>
          )}
          <Button onClick={onRetake}>
            <Camera size={18} /> {t.capture.retake}
          </Button>
          <Button onClick={onCancel}>{t.app.cancel}</Button>
        </div>
        <p className="mt-3 text-[12px] text-ink-tertiary">{t.capture.savedBoth}</p>
      </div>
    </div>
  );
}
