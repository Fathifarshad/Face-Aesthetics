import { useEffect } from 'react';
import type { Bi } from '../analysis/catalog';
import { useApp, type Lang } from '../store/app';
import { en } from './en';
import { fa, type Dict } from './fa';

const DICTS: Record<Lang, Dict> = { fa, en };

export function useT(): Dict {
  return DICTS[useApp((s) => s.lang)];
}

export const dictFor = (lang: Lang): Dict => DICTS[lang];

export const pick = (bi: Bi, lang: Lang): string => bi[lang];

export function useBi(): (bi: Bi) => string {
  const lang = useApp((s) => s.lang);
  return (bi) => bi[lang];
}

export function numberFormatter(lang: Lang) {
  const locale = lang === 'fa' ? 'fa-IR' : 'en-US';
  return (n: number, digits = 0) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function useNum() {
  return numberFormatter(useApp((s) => s.lang));
}

/** Jalali + Gregorian dates (PRD §5.8). */
export function formatDate(ts: number, lang: Lang): string {
  const d = new Date(ts);
  const jalali = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  const greg = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-gregory' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
  return lang === 'fa' ? `${jalali} (${greg})` : `${greg} (${jalali})`;
}

/** Keeps <html lang/dir> in sync with the chosen language. */
export function useDocumentLang() {
  const lang = useApp((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);
}
