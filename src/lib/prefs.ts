import { createContext, useContext } from 'react';
import { STRINGS, formatNumber, type Lang, type Numerals } from './i18n';

export type Theme = 'auto' | 'night' | 'day';

export interface Prefs {
  lang: Lang;
  numerals: Numerals;
  theme: Theme;
}

export const DEFAULT_PREFS: Prefs = { lang: 'ar', numerals: 'auto', theme: 'auto' };
const KEY = 'dt.prefs.v1';

/** Read saved preferences; anything malformed falls back to the defaults. */
export function loadPrefs(storage: Pick<Storage, 'getItem'> = localStorage): Prefs {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return {
      lang: raw.lang === 'en' ? 'en' : 'ar',
      numerals: raw.numerals === 'arab' || raw.numerals === 'latn' ? raw.numerals : 'auto',
      theme: raw.theme === 'night' || raw.theme === 'day' ? raw.theme : 'auto',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(KEY, JSON.stringify(p));
}

export interface PrefsCtx {
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
}

export const PrefsContext = createContext<PrefsCtx>({ prefs: DEFAULT_PREFS, setPrefs: () => {} });

export function usePrefs() {
  const { prefs, setPrefs } = useContext(PrefsContext);
  const t = STRINGS[prefs.lang];
  const fmt = (n: number) => formatNumber(n, prefs.lang, prefs.numerals);
  return { prefs, setPrefs, t, fmt };
}
