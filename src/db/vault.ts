import { create } from 'zustand';
import {
  generateDataKey,
  newRecoveryCode,
  normalizeRecoveryCode,
  open,
  openText,
  seal,
  sealText,
  unwrapDataKey,
  wrapDataKey,
  type Sealed,
} from './crypto';
import { db } from './db';
import type { VaultRecord } from './types';

/**
 * The doctor's vault: holds the image key for the current session, in memory only.
 * Nothing here is written to storage except the wrapped key record (settings key "vault").
 * Locking, a reload or closing the tab forgets the key; the passphrase is needed again.
 */
export type VaultStatus = 'loading' | 'none' | 'locked' | 'unlocked';

type VaultStore = {
  status: VaultStatus;
  /** A recovery code that was just issued and must be shown to the doctor once. Never stored. */
  recoveryCode: string | null;
};
export const useVault = create<VaultStore>(() => ({ status: 'loading', recoveryCode: null }));

export class VaultLockedError extends Error {
  constructor() {
    super('vault is locked');
    this.name = 'VaultLockedError';
  }
}

const VAULT_KEY = 'vault';
/** Decrypted images kept for the session so pages do not decrypt (and re-render) on every query. */
const CACHE_LIMIT = 40;

let sessionKey: CryptoKey | null = null;
const cache = new Map<string, Blob>();

const readVault = async (): Promise<VaultRecord | undefined> => (await db.settings.get(VAULT_KEY))?.value as VaultRecord | undefined;
const writeVault = (value: VaultRecord) => db.settings.put({ key: VAULT_KEY, value });
const requireKey = (): CryptoKey => {
  if (!sessionKey) throw new VaultLockedError();
  return sessionKey;
};

/** Reads whether a vault exists. Call once when the doctor area mounts. */
export async function initVault(): Promise<void> {
  const exists = !!(await readVault());
  useVault.setState({ status: !exists ? 'none' : sessionKey ? 'unlocked' : 'locked' });
}

/** First run: creates the image key, wraps it with the passphrase and a new recovery code, and unlocks. */
export async function createVault(passphrase: string): Promise<void> {
  if (await readVault()) throw new Error('vault already exists');
  const key = await generateDataKey();
  const code = newRecoveryCode();
  const record: VaultRecord = {
    version: 1,
    pass: await wrapDataKey(key, passphrase),
    recovery: await wrapDataKey(key, normalizeRecoveryCode(code)),
    migrated: false,
    createdAt: Date.now(),
  };
  await writeVault(record);
  // Set before unlocking, so the code screen is shown first and the app never flashes behind it.
  useVault.setState({ recoveryCode: code });
  await start(record, passphrase);
}

/** Throws WrongSecretError when the passphrase does not match. */
export async function unlock(passphrase: string): Promise<void> {
  const record = await readVault();
  if (!record) throw new Error('no vault');
  await start(record, passphrase);
}

async function start(record: VaultRecord, passphrase: string): Promise<void> {
  sessionKey = await unwrapDataKey(record.pass, passphrase);
  if (!record.migrated) {
    await sealLegacyImages();
    await writeVault({ ...record, migrated: true });
  }
  useVault.setState({ status: 'unlocked' });
}

/** Forgets the key and every decrypted image. */
export function lock(): void {
  sessionKey = null;
  cache.clear();
  if (useVault.getState().status === 'unlocked') useVault.setState({ status: 'locked', recoveryCode: null });
}

/** Forgotten passphrase: the recovery code sets a new passphrase and is replaced by a new code. */
export async function recoverWithCode(code: string, newPassphrase: string): Promise<void> {
  const record = await readVault();
  if (!record) throw new Error('no vault');
  const key = await unwrapDataKey(record.recovery, normalizeRecoveryCode(code), true);
  const nextCode = newRecoveryCode();
  const next: VaultRecord = {
    ...record,
    pass: await wrapDataKey(key, newPassphrase),
    recovery: await wrapDataKey(key, normalizeRecoveryCode(nextCode)),
  };
  await writeVault(next);
  useVault.setState({ recoveryCode: nextCode });
  await start(next, newPassphrase);
}

/** Throws WrongSecretError when `current` is wrong. Stored images are not touched. */
export async function changePassphrase(current: string, next: string): Promise<void> {
  const record = await readVault();
  if (!record) throw new Error('no vault');
  const key = await unwrapDataKey(record.pass, current, true);
  await writeVault({ ...record, pass: await wrapDataKey(key, next) });
}

/** Issues a new recovery code (the old one stops working) and returns it for one-time display. */
export async function renewRecoveryCode(passphrase: string): Promise<string> {
  const record = await readVault();
  if (!record) throw new Error('no vault');
  const key = await unwrapDataKey(record.pass, passphrase, true);
  const code = newRecoveryCode();
  await writeVault({ ...record, recovery: await wrapDataKey(key, normalizeRecoveryCode(code)) });
  return code;
}

export const dismissRecoveryCode = (): void => useVault.setState({ recoveryCode: null });

// ── Sealing and opening, used by src/db/images.ts ──────────────────────

export const sealBlob = (blob: Blob): Promise<Sealed> => seal(requireKey(), blob);
export const sealString = (text: string): Promise<Sealed> => sealText(requireKey(), text);
export const openString = (sealed: Sealed): Promise<string> => openText(requireKey(), sealed);

/** Decrypts an image; `id` (the row id) keys the session cache so the same Blob is returned each time. */
export async function openBlob(id: string, sealed: Sealed): Promise<Blob> {
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const blob = await open(requireKey(), sealed);
  cache.set(id, blob);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return blob;
}

export const forgetImage = (id: string): void => void cache.delete(id);

/** Decrypts without touching the session cache (backup of every image, `src/db/images.ts`). */
export const openUncached = (sealed: Sealed): Promise<Blob> => open(requireKey(), sealed);

/** Encrypts images that were stored before the vault existed (v1 kit data). Safe to run again. */
async function sealLegacyImages(): Promise<void> {
  type Legacy = { blob?: Blob; signature?: string };
  const photos = (await db.photos.toArray()) as unknown as (Legacy & { id: string })[];
  for (const row of photos) {
    if (!row.blob) continue;
    const { blob, ...rest } = row;
    await db.photos.put({ ...rest, sealed: await sealBlob(blob) } as never);
  }
  const sims = (await db.simulations.toArray()) as unknown as (Legacy & { id: string })[];
  for (const row of sims) {
    if (!row.blob) continue;
    const { blob, ...rest } = row;
    await db.simulations.put({ ...rest, sealed: await sealBlob(blob) } as never);
  }
  const signoffs = (await db.signoffs.toArray()) as unknown as (Legacy & { caseId: string })[];
  for (const row of signoffs) {
    if (typeof row.signature !== 'string') continue;
    const { signature, ...rest } = row;
    await db.signoffs.put({ ...rest, sealedSignature: await sealString(signature) } as never);
  }
}
