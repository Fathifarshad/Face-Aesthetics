import { create } from 'zustand';

export type Lang = 'fa' | 'en';

const readLang = (): Lang => {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'fa';
  } catch {
    return 'fa';
  }
};

type AppState = { lang: Lang; setLang: (l: Lang) => void; toggleLang: () => void };

export const useApp = create<AppState>((set, get) => ({
  lang: readLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem('lang', lang);
    } catch {
      // storage unavailable (private mode) — keep in memory only
    }
    set({ lang });
  },
  toggleLang: () => get().setLang(get().lang === 'fa' ? 'en' : 'fa'),
}));
