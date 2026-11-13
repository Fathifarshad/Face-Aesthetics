/**
 * Encryption primitives for images at rest (docs/PRD.md §10.1, hard rule 10). Web Crypto only, no dependency.
 *
 * Scheme: one random 256-bit AES-GCM data key encrypts every image. That key is stored only wrapped
 * (AES-GCM) by a key derived with PBKDF2-SHA-256 from the doctor's passphrase, and a second time by a
 * key derived from the recovery code. Changing the passphrase re-wraps the data key; images are not re-encrypted.
 */

/** PBKDF2-HMAC-SHA-256 work factor (OWASP password storage guidance, 2023). */
export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

/** An encrypted payload as stored in IndexedDB. `type` is the MIME type of the plaintext. */
export type Sealed = { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer; type: string };

/** The data key, wrapped by a secret-derived key. */
export type WrappedKey = { salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer; iterations: number };

export class WrongSecretError extends Error {
  constructor() {
    super('wrong passphrase or recovery code');
    this.name = 'WrongSecretError';
  }
}

const AES = { name: 'AES-GCM', length: 256 } as const;
const random = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

async function deriveWrappingKey(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, AES, false, ['wrapKey', 'unwrapKey']);
}

/** New random data key. Extractable only so that it can be wrapped. */
export const generateDataKey = (): Promise<CryptoKey> => crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);

export async function wrapDataKey(dataKey: CryptoKey, secret: string, iterations = KDF_ITERATIONS): Promise<WrappedKey> {
  const salt = random(16);
  const iv = random(12);
  const kek = await deriveWrappingKey(secret, salt, iterations);
  const data = await crypto.subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv });
  return { salt, iv, data, iterations };
}

/**
 * Recovers the data key. Throws WrongSecretError when the secret does not match (AES-GCM authentication fails).
 * `extractable` is needed only to wrap the key again (passphrase change); the session key stays non-extractable.
 */
export async function unwrapDataKey(wrapped: WrappedKey, secret: string, extractable = false): Promise<CryptoKey> {
  const kek = await deriveWrappingKey(secret, wrapped.salt, wrapped.iterations);
  try {
    return await crypto.subtle.unwrapKey('raw', wrapped.data, kek, { name: 'AES-GCM', iv: wrapped.iv }, AES, extractable, ['encrypt', 'decrypt']);
  } catch {
    throw new WrongSecretError();
  }
}

/** Encrypts a blob with a fresh random IV. */
export async function seal(key: CryptoKey, blob: Blob): Promise<Sealed> {
  const iv = random(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return { iv, data, type: blob.type };
}

/** Decrypts a sealed payload; throws if the key is wrong or the bytes were altered. */
export async function open(key: CryptoKey, sealed: Sealed): Promise<Blob> {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, key, sealed.data);
  return new Blob([data], { type: sealed.type });
}

export const sealText = (key: CryptoKey, text: string): Promise<Sealed> => seal(key, new Blob([text], { type: 'text/plain' }));
export const openText = async (key: CryptoKey, sealed: Sealed): Promise<string> => (await open(key, sealed)).text();

/** Crockford base32 without I, L, O, U: unambiguous when copied by hand. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_GROUPS = 5;
const RECOVERY_GROUP_SIZE = 5;

/** Random recovery code, 125 bits, shown once: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX. */
export function newRecoveryCode(): string {
  const bytes = random(RECOVERY_GROUPS * RECOVERY_GROUP_SIZE);
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]!);
  return Array.from({ length: RECOVERY_GROUPS }, (_, g) => chars.slice(g * RECOVERY_GROUP_SIZE, (g + 1) * RECOVERY_GROUP_SIZE).join('')).join('-');
}

/** Canonical form of a typed recovery code: upper case, no separators, look-alike letters mapped to digits. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export const isRecoveryCode = (input: string): boolean => {
  const c = normalizeRecoveryCode(input);
  return c.length === RECOVERY_GROUPS * RECOVERY_GROUP_SIZE && [...c].every((ch) => ALPHABET.includes(ch));
};
