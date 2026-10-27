/** Crockford base32 (no I, L, O, U) — easy to read aloud and type. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += ALPHABET.indexOf(body[i]!) * (i + 1);
  return ALPHABET[sum % 32]!;
}

/** e.g. "TN-7K3P-92QA-M": 8 random chars + 1 check char. */
export function newPatientCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(8);
  const body = Array.from(bytes, (b) => ALPHABET[b % 32]).join('');
  return `TN-${body.slice(0, 4)}-${body.slice(4)}-${checkChar(body)}`;
}

/** Uppercases, strips separators and maps look-alike characters. Returns the canonical form or null if invalid. */
export function normalizePatientCode(input: string): string | null {
  const raw = input
    .toUpperCase()
    .replace(/[\s_-]/g, '')
    .replace(/^TN/, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (raw.length !== 9 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  const body = raw.slice(0, 8);
  if (checkChar(body) !== raw[8]) return null;
  return `TN-${body.slice(0, 4)}-${body.slice(4)}-${raw[8]}`;
}
