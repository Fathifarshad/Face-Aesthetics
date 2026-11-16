import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards for the hard rules in prompts/SUPERPROMPT.md:
 * rule 9 (no CDN, tracker or remote asset), rule 16 (colours only from tokens) and a first line of
 * defence for rule 8 (no network call in app code; the runtime test with real requests is e2e/privacy.spec.ts).
 */
const SRC = join(process.cwd(), 'src');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const sources = walk(SRC)
  .filter((f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => ({ file: relative(SRC, f).split(sep).join('/'), text: readFileSync(f, 'utf8') }));

const offenders = (pattern: RegExp, allowed: readonly string[] = []) =>
  sources
    .filter((s) => !allowed.includes(s.file))
    .flatMap((s) =>
      s.text
        .split('\n')
        .map((line, i) => (pattern.test(line) ? `${s.file}:${i + 1}: ${line.trim().slice(0, 100)}` : null))
        .filter((x): x is string => x !== null),
    );

describe('source guards', () => {
  it('finds the source tree', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('writes colour values only in the token file', () => {
    // styles.css defines the tokens; lib/color.ts holds the clinic report accent default (data, not UI).
    const allowed = ['styles.css', 'lib/color.ts'];
    expect(offenders(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/, allowed)).toEqual([]);
    expect(offenders(/\b(?:rgba?|hsla?)\(\s*\d/, allowed)).toEqual([]);
  });

  it('references no remote URL (fonts, scripts, models and WASM are served by the app)', () => {
    expect(offenders(/https?:\/\//)).toEqual([]);
  });

  it('makes no network call from app code', () => {
    // share/exchange.ts decodes a data: URL with fetch(); nothing leaves the device.
    expect(offenders(/\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|EventSource/, ['share/exchange.ts'])).toEqual([]);
  });
});
