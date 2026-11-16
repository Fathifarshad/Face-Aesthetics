import type { Bi } from '../analysis/catalog';
import type { ViewId } from './views';

export type ServiceId = 'full-analysis' | 'base' | 'upper-toxin' | 'mid-lower-filler' | 'lips' | 'jaw-neck';

export type ServiceDef = { id: ServiceId; label: Bi; views: readonly ViewId[] };

/** PRD §8, row «همهٔ اقدام‌ها (پایه)»: every procedure starts with these. */
const BASE: readonly ViewId[] = ['frontal', 'oblique-r', 'oblique-l', 'profile-r', 'profile-l'];

/**
 * Photo sets per procedure (PRD §8, F8.1). The same set is taken before and after treatment.
 * TODO(clinical): PRD §8 is a draft from common practice; the clinic adapts it to its own protocol.
 */
export const SERVICES: readonly ServiceDef[] = [
  {
    id: 'full-analysis',
    label: { fa: 'آنالیز کامل چهره', en: 'Full face analysis' },
    views: [...BASE, 'smile', 'frown', 'brows-raised', 'eyes-closed', 'lips-closeup', 'lips-pursed', 'submental', 'head-down', 'clench-neck'],
  },
  { id: 'base', label: { fa: 'همهٔ اقدام‌ها — پایه (پوست و سایر)', en: 'Any procedure — base (skin and other)' }, views: BASE },
  { id: 'upper-toxin', label: { fa: 'توکسین بالای صورت', en: 'Upper-face toxin' }, views: [...BASE, 'frown', 'brows-raised', 'smile', 'eyes-closed'] },
  { id: 'mid-lower-filler', label: { fa: 'فیلر میانه و پایین صورت', en: 'Mid- and lower-face filler' }, views: [...BASE, 'submental', 'smile'] },
  { id: 'lips', label: { fa: 'لب', en: 'Lips' }, views: [...BASE, 'lips-closeup', 'smile', 'lips-pursed'] },
  { id: 'jaw-neck', label: { fa: 'خط فک و گردن', en: 'Jawline and neck' }, views: [...BASE, 'head-down', 'clench-neck'] },
];

/** Service ids of the v1 kit, still stored on older cases. */
const LEGACY: Record<string, ServiceId> = {
  'eyes-teartrough': 'mid-lower-filler',
  'midface-cheek': 'mid-lower-filler',
  'jaw-chin': 'jaw-neck',
  neck: 'jaw-neck',
  skin: 'base',
};

const ORDER: readonly ViewId[] = SERVICES[0]!.views;

/** Union of required views for the chosen services, in the standard capture order. */
export function requiredViews(services: readonly string[]): ViewId[] {
  const ids = new Set(services.map((s) => LEGACY[s] ?? s));
  const set = new Set<ViewId>();
  for (const s of SERVICES) if (ids.has(s.id)) s.views.forEach((v) => set.add(v));
  if (set.size === 0) set.add('frontal');
  return ORDER.filter((v) => set.has(v));
}
