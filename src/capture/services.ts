import type { Bi } from '../analysis/catalog';
import type { ViewId } from './views';

export type ServiceId =
  | 'full-analysis'
  | 'lips'
  | 'eyes-teartrough'
  | 'upper-toxin'
  | 'midface-cheek'
  | 'jaw-chin'
  | 'neck'
  | 'skin';

export type ServiceDef = { id: ServiceId; label: Bi; views: readonly ViewId[] };

/**
 * Standard photo sets per service. Same set is required before and after treatment.
 * TODO(clinical): clinical lead to confirm each set against the clinic photography protocol.
 */
export const SERVICES: readonly ServiceDef[] = [
  {
    id: 'full-analysis',
    label: { fa: 'آنالیز کامل چهره', en: 'Full face analysis' },
    views: [
      'frontal',
      'oblique-r',
      'oblique-l',
      'profile-r',
      'profile-l',
      'smile',
      'frown',
      'brows-raised',
      'lips-pursed',
      'submental',
      'clench-neck',
    ],
  },
  {
    id: 'lips',
    label: { fa: 'لب', en: 'Lips' },
    views: ['frontal', 'oblique-r', 'oblique-l', 'profile-r', 'profile-l', 'smile', 'lips-pursed'],
  },
  { id: 'eyes-teartrough', label: { fa: 'زیر چشم', en: 'Tear trough / eyes' }, views: ['frontal', 'oblique-r', 'oblique-l', 'smile'] },
  { id: 'upper-toxin', label: { fa: 'بوتاکس بالای صورت', en: 'Upper-face toxin' }, views: ['frontal', 'frown', 'brows-raised', 'smile'] },
  {
    id: 'midface-cheek',
    label: { fa: 'گونه و میانهٔ صورت (فیلر/نخ)', en: 'Cheek & mid-face (filler/threads)' },
    views: ['frontal', 'oblique-r', 'oblique-l', 'profile-r', 'profile-l', 'smile'],
  },
  {
    id: 'jaw-chin',
    label: { fa: 'خط فک و چانه', en: 'Jawline & chin' },
    views: ['frontal', 'oblique-r', 'oblique-l', 'profile-r', 'profile-l', 'submental', 'clench-neck'],
  },
  { id: 'neck', label: { fa: 'گردن', en: 'Neck' }, views: ['frontal', 'profile-r', 'profile-l', 'submental', 'clench-neck'] },
  { id: 'skin', label: { fa: 'کیفیت پوست', en: 'Skin quality' }, views: ['frontal', 'oblique-r', 'oblique-l'] },
];

const ORDER: readonly ViewId[] = SERVICES[0]!.views;

/** Union of required views for the chosen services, in the standard capture order. */
export function requiredViews(services: readonly string[]): ViewId[] {
  const set = new Set<ViewId>();
  for (const s of SERVICES) if (services.includes(s.id)) s.views.forEach((v) => set.add(v));
  if (set.size === 0) set.add('frontal');
  return ORDER.filter((v) => set.has(v));
}
