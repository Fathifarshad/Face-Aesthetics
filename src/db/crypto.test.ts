import { describe, expect, it } from 'vitest';
import {
  generateDataKey,
  isRecoveryCode,
  KDF_ITERATIONS,
  newRecoveryCode,
  normalizeRecoveryCode,
  open,
  openText,
  seal,
  sealText,
  unwrapDataKey,
  wrapDataKey,
  WrongSecretError,
} from './crypto';

/** Low work factor keeps the suite fast; one test below uses the real one. */
const FAST = 1_000;
const bytes = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b));
const includes = (haystack: ArrayBuffer, needle: Uint8Array) => {
  const h = new Uint8Array(haystack);
  outer: for (let i = 0; i + needle.length <= h.length; i++) {
    for (let j = 0; j < needle.length; j++) if (h[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

/** Synthetic "photo": a JPEG start marker followed by a recognisable pattern. No real image. */
const MARKER = new TextEncoder().encode('SYNTHETIC-PHOTO-PAYLOAD');
const fakePhoto = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), MARKER, new Uint8Array(2000).fill(7)], { type: 'image/jpeg' });

describe('image encryption', () => {
  it('round-trips a blob and keeps its type', async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, fakePhoto());
    const back = await open(key, sealed);
    expect(back.type).toBe('image/jpeg');
    expect(bytes(await back.arrayBuffer())).toEqual(bytes(await fakePhoto().arrayBuffer()));
  });

  it('stores no readable part of the photo', async () => {
    const sealed = await seal(await generateDataKey(), fakePhoto());
    expect(includes(sealed.data, MARKER)).toBe(false);
    expect(bytes(sealed.data).slice(0, 3)).not.toEqual([0xff, 0xd8, 0xff]);
    expect(sealed.iv).toHaveLength(12);
  });

  it('uses a fresh IV, so the same photo encrypts differently each time', async () => {
    const key = await generateDataKey();
    const a = await seal(key, fakePhoto());
    const b = await seal(key, fakePhoto());
    expect(bytes(a.iv)).not.toEqual(bytes(b.iv));
    expect(bytes(a.data)).not.toEqual(bytes(b.data));
  });

  it('refuses to open with another key or after the bytes were altered', async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, fakePhoto());
    await expect(open(await generateDataKey(), sealed)).rejects.toThrow();
    const tampered = new Uint8Array(sealed.data.slice(0));
    tampered[10] = tampered[10]! ^ 1;
    await expect(open(key, { ...sealed, data: tampered.buffer })).rejects.toThrow();
  });

  it('round-trips text (used for the signature image data URL)', async () => {
    const key = await generateDataKey();
    expect(await openText(key, await sealText(key, 'data:image/png;base64,AAAA'))).toBe('data:image/png;base64,AAAA');
  });
});

describe('key wrapping', () => {
  it('unlocks with the right passphrase only', async () => {
    const key = await generateDataKey();
    const wrapped = await wrapDataKey(key, 'گذرواژهٔ درست 1', FAST);
    const sealed = await seal(key, fakePhoto());
    const unlocked = await unwrapDataKey(wrapped, 'گذرواژهٔ درست 1');
    expect((await open(unlocked, sealed)).size).toBe(fakePhoto().size);
    await expect(unwrapDataKey(wrapped, 'گذرواژهٔ درست 2')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unwrapDataKey(wrapped, '')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('gives a session key that cannot be exported', async () => {
    const wrapped = await wrapDataKey(await generateDataKey(), 'passphrase-1', FAST);
    const session = await unwrapDataKey(wrapped, 'passphrase-1');
    expect(session.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', session)).rejects.toThrow();
  });

  it('re-wraps for a new passphrase without touching encrypted photos', async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, fakePhoto());
    const old = await wrapDataKey(key, 'old-passphrase', FAST);
    const rewrapped = await wrapDataKey(await unwrapDataKey(old, 'old-passphrase', true), 'new-passphrase', FAST);
    await expect(unwrapDataKey(rewrapped, 'old-passphrase')).rejects.toBeInstanceOf(WrongSecretError);
    expect((await open(await unwrapDataKey(rewrapped, 'new-passphrase'), sealed)).size).toBe(fakePhoto().size);
  });

  it('uses a random salt and records the work factor', async () => {
    const key = await generateDataKey();
    const a = await wrapDataKey(key, 'same-passphrase', FAST);
    const b = await wrapDataKey(key, 'same-passphrase', FAST);
    expect(bytes(a.salt)).not.toEqual(bytes(b.salt));
    expect(bytes(a.data)).not.toEqual(bytes(b.data));
    expect(a.iterations).toBe(FAST);
  });

  it('works at the real work factor (600 000 PBKDF2 iterations)', async () => {
    expect(KDF_ITERATIONS).toBe(600_000);
    const key = await generateDataKey();
    const wrapped = await wrapDataKey(key, 'passphrase-1');
    expect(wrapped.iterations).toBe(600_000);
    expect((await unwrapDataKey(wrapped, 'passphrase-1')).type).toBe('secret');
  }, 30_000);
});

describe('recovery code', () => {
  it('has five groups of five unambiguous characters and differs every time', () => {
    const a = newRecoveryCode();
    expect(a).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(isRecoveryCode(a)).toBe(true);
    expect(newRecoveryCode()).not.toBe(a);
  });

  it('accepts the code however it is typed back', () => {
    expect(normalizeRecoveryCode('ab1de-fgh0j kmnpq.rstvw xyz23')).toBe('AB1DEFGH0JKMNPQRSTVWXYZ23');
    expect(normalizeRecoveryCode('O0oIl')).toBe('00011');
    expect(isRecoveryCode('ab1de fgh0j kmnpq rstvw xyz23')).toBe(true);
    expect(isRecoveryCode('too-short')).toBe(false);
    expect(isRecoveryCode('UUUUU-UUUUU-UUUUU-UUUUU-UUUUU')).toBe(false);
  });

  it('unlocks the same data key as the passphrase', async () => {
    const key = await generateDataKey();
    const code = newRecoveryCode();
    const byCode = await wrapDataKey(key, normalizeRecoveryCode(code), FAST);
    const sealed = await seal(key, fakePhoto());
    const typed = code.toLowerCase().replace(/-/g, ' ');
    expect((await open(await unwrapDataKey(byCode, normalizeRecoveryCode(typed)), sealed)).size).toBe(fakePhoto().size);
  });
});
