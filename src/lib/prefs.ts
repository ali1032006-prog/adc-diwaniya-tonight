import { createContext, useContext } from 'react';
import { STRINGS, formatNumber, localeFor, type Lang, type Numerals } from './i18n';
import { COPY, type Copy } from './copy';
import { ApiError } from './api';

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

/** Map an API failure to copy that names the problem and the way out. */
export function errorText(e: unknown, c: Copy): string {
  const code = e instanceof ApiError ? e.code : '';
  if (code === 'offline' || (e instanceof TypeError && /fetch/i.test(e.message))) return c.errors.offline;
  if (code === '28000' || code === 'PGRST301') return c.errors.signIn;
  if (code === 'P0002' || code === 'PGRST116') return c.errors.notFound;
  if (code === '42501') return c.errors.forbidden;
  if (code === '23514') return c.errors.cap;
  if (code === '54000') return c.errors.limit;
  if (code === '23505') return c.errors.duplicate;
  if (code === '22023' || code === '22P02' || code === '23502') return c.errors.invalid;
  return c.errors.unknown;
}

export function usePrefs() {
  const { prefs, setPrefs } = useContext(PrefsContext);
  const t = STRINGS[prefs.lang];
  const c = COPY[prefs.lang];
  const locale = localeFor(prefs.lang, prefs.numerals);
  const fmt = (n: number) => formatNumber(n, prefs.lang, prefs.numerals);
  // Kuwait time for every clock in the app; the clock itself is never mirrored.
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuwait' }).format(new Date(iso));
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuwait' }).format(new Date(iso));
  const err = (e: unknown) => errorText(e, c);
  return { prefs, setPrefs, t, c, fmt, time, date, err };
}
