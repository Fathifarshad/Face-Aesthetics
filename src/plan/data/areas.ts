import type { Bi } from '../../analysis/catalog';
import type { Area } from './treatments';

export const AREA_LABEL: Record<Area, Bi> = {
  forehead: { fa: 'پیشانی', en: 'Forehead' },
  glabella: { fa: 'بین ابرو', en: 'Glabella' },
  periorbital: { fa: 'دور چشم', en: 'Periorbital' },
  temple: { fa: 'شقیقه', en: 'Temple' },
  midface: { fa: 'گونه', en: 'Mid-face' },
  perioral: { fa: 'دور دهان', en: 'Perioral' },
  lips: { fa: 'لب', en: 'Lips' },
  chin: { fa: 'چانه', en: 'Chin' },
  jaw: { fa: 'فک', en: 'Jaw' },
  neck: { fa: 'گردن', en: 'Neck' },
  skin: { fa: 'کل پوست', en: 'Whole skin' },
};
