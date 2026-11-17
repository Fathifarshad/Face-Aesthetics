import { describe, expect, it } from 'vitest';
import { newPatientCode, normalizePatientCode } from '../db/patientCode';
import { PACKAGE_FORMAT, REPLY_FORMAT, mergeMessages, parseIncoming } from './format';

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
    format: REPLY_FORMAT,
    version: 2,
    exportedAt: 1,
    code: 'TN-0000-0000-0',
    messages: [{ id: 'm1', from: 'patient', text: 'سلام', at: 5 }],
    photos: [{ id: 'p1', view: 'frontal', dataUrl: 'data:image/jpeg;base64,AAAA', takenAt: 1 }],
  };
  it('accepts a valid reply', () => {
    expect(parseIncoming(JSON.stringify(reply)).format).toBe(REPLY_FORMAT);
  });
  it('rejects non-image data URLs and unknown formats', () => {
    const bad = { ...reply, photos: [{ ...reply.photos[0], dataUrl: 'data:text/html;base64,AAAA' }] };
    expect(() => parseIncoming(JSON.stringify(bad))).toThrow('malformed');
    expect(() => parseIncoming(JSON.stringify({ ...reply, format: 'x' }))).toThrow('unknown-format');
    expect(() => parseIncoming('{')).toThrow('not-json');
    expect(() => parseIncoming(JSON.stringify({ ...reply, version: 3 }))).toThrow('unsupported-version');
    expect(() => parseIncoming(JSON.stringify({ ...reply, format: 'tanasob/patient-reply', version: 2 }))).toThrow('unsupported-version');
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

describe('package versions (PRD F10.7)', () => {
  const bi = (x: string) => ({ fa: x, en: x });
  const v1 = {
    format: 'tanasob/patient-package',
    version: 1,
    exportedAt: 1,
    code: 'TN-0000-0000-0',
    patientName: 'synthetic',
    clinic: { name: 'c', doctor: 'd', phone: '', address: '' },
    cases: [
      {
        id: 'c1',
        date: 1,
        services: ['full'],
        actualAge: 40,
        targetAge: 35,
        findings: [{ key: 'tear-trough', label: bi('a'), patient: bi('b'), severity: 3 }],
        plan: [],
        sessions: [],
        aftercare: [],
        signedAt: 2,
        doctorName: 'd',
      },
    ],
    photos: [],
    messages: [],
  };
  it('still reads a v1 kit file and maps it to the v2 id', () => {
    const pkg = parseIncoming(JSON.stringify(v1));
    expect(pkg.format).toBe(PACKAGE_FORMAT);
    expect(pkg.version).toBe(1);
  });
  it('drops the grade a v1 file carried (F10.6)', () => {
    const pkg = parseIncoming(JSON.stringify(v1));
    if (pkg.format !== PACKAGE_FORMAT) throw new Error('kind');
    expect(pkg.cases[0]!.findings[0]).toEqual({ key: 'tear-trough', label: bi('a'), patient: bi('b') });
    expect(JSON.stringify(pkg)).not.toContain('severity');
  });
  it('reads a v2 file with the doctor note', () => {
    const v2 = { ...v1, format: PACKAGE_FORMAT, version: 2, cases: [{ ...v1.cases[0], findings: [], note: 'hello' }] };
    const pkg = parseIncoming(JSON.stringify(v2));
    if (pkg.format !== PACKAGE_FORMAT) throw new Error('kind');
    expect(pkg.cases[0]!.note).toBe('hello');
    expect(() => parseIncoming(JSON.stringify({ ...v2, cases: [{ ...v2.cases[0], note: 5 }] }))).toThrow('malformed');
  });
});
