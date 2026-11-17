import { CATALOG, GRADED_KEYS } from './catalog';
import { frontalFindings } from './metrics';
import { proxySuggestions } from './proxies';
import type { Finding, Landmarks, LuminanceSampler } from './types';

/** Automatic metrics + clinician-graded findings with proxy pre-selection where a proxy exists. */
export function buildFindings(raw: Landmarks | null, sample: LuminanceSampler | null): Finding[] {
  const auto = raw ? frontalFindings(raw) : [];
  const proxies = new Map((raw ? proxySuggestions(raw, sample) : []).map((s) => [s.key, s]));
  const graded: Finding[] = GRADED_KEYS.map((key) => {
    const c = CATALOG[key]!;
    const s = proxies.get(key);
    return {
      key,
      tab: c.tab,
      value: null,
      display: s ? `proxy ${s.value.toFixed(2)}` : undefined,
      unit: '',
      reference: c.scaleName ?? '',
      deviation: null,
      severitySuggested: s?.severity ?? null,
      severity: s?.severity ?? null,
      confidence: s ? s.confidence : 'manual',
      source: 'clinician',
      scaleName: c.scaleName,
      status: 'pending',
      planKeys: [key],
    };
  });
  return [...auto, ...graded];
}
