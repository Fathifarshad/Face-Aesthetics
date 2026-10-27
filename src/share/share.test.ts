import { describe, expect, it } from 'vitest';
import { newPatientCode, normalizePatientCode } from '../db/patientCode';
import { mergeMessages, parseIncoming } from './format';

describe('patient code', () => {
  const code = newPatientCode((n) => new Uint8Array(n).map((_, i) => i * 7 + 3));
  it('has the expected shape and validates', () => {
    expect(code).toMatch(/^TN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/);
    expect(normalizePatientCode(code)).toBe(code);
  });
  it('accepts lower case, spaces and look-alike letters', () => {
    expect(normalizePatientCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
  });
  it('rejects a typo via the check character', () => {
    const body = code.replace(/-/g, '').slice(2);
    const typo = body[0] === 'A' ? 'B' + body.slice(1) : 'A' + body.slice(1);
    expect(normalizePatientCode(typo)).toBeNull();
    expect(normalizePatientCode('hello')).toBeNull();
  });
});

describe('package parsing', () => {
  const reply = {
    format: 'tanasob/patient-reply',
    version: 1,
    exportedAt: 1,
    code: 'TN-0000-0000-0',
    messages: [{ id: 'm1', from: 'patient', text: 'سلام', at: 5 }],
    photos: [{ id: 'p1', view: 'frontal', dataUrl: 'data:image/jpeg;base64,AAAA', takenAt: 1 }],
  };
  it('accepts a valid reply', () => {
    expect(parseIncoming(JSON.stringify(reply)).format).toBe('tanasob/patient-reply');
  });
  it('rejects non-image data URLs and unknown formats', () => {
    const bad = { ...reply, photos: [{ ...reply.photos[0], dataUrl: 'data:text/html;base64,AAAA' }] };
    expect(() => parseIncoming(JSON.stringify(bad))).toThrow('malformed');
    expect(() => parseIncoming(JSON.stringify({ ...reply, format: 'x' }))).toThrow('unknown-format');
    expect(() => parseIncoming('{')).toThrow('not-json');
    expect(() => parseIncoming(JSON.stringify({ ...reply, version: 2 }))).toThrow('unsupported-version');
  });
  it('merges messages without duplicates', () => {
    const a = [{ id: '1', at: 1 }];
    const b = [
      { id: '1', at: 1 },
      { id: '2', at: 0 },
    ];
    expect(mergeMessages(a, b).map((m) => m.id)).toEqual(['2', '1']);
  });
});
