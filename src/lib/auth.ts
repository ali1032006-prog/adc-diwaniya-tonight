import { supabase } from './supabase';

// Sign-in for Diwaniya Tonight (Ali's ruling A, ADC-LOG-696): Google only, through Supabase Auth.
// The email provider is closed on the project, so there is no password form anywhere.

const AFTER = 'dt.after-signin.v1';
const REGISTER = 'dt.register.v1';
const RETURN_ERROR = 'dt.signin-error.v1';
export const MIN_AGE = 18; // ruling B; the server checks it again in complete_profile

/** Whole years between a YYYY-MM-DD birth date and today (local calendar). */
export function ageOn(birth: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let age = today.getFullYear() - y;
  const before = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (before) age -= 1;
  return age;
}

export function isAdult(birth: string, today?: Date): boolean {
  const a = ageOn(birth, today);
  return a !== null && a >= MIN_AGE && a < 130;
}

/** The latest birth date that is 18 today, for the date input's max. */
export function maxBirthDate(today: Date = new Date()): string {
  const d = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PendingRegister {
  birth: string;
  terms: boolean;
}

/** What the Register tab collected, kept in this tab only until profile setup uses it. */
export function savePendingRegister(p: PendingRegister) {
  sessionStorage.setItem(REGISTER, JSON.stringify(p));
}

export function pendingRegister(): PendingRegister | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(REGISTER) ?? 'null') as Partial<PendingRegister> | null;
    if (!v || typeof v.birth !== 'string') return null;
    return { birth: v.birth, terms: v.terms === true };
  } catch {
    return null;
  }
}

export function clearPendingRegister() {
  sessionStorage.removeItem(REGISTER);
}

/** Only in-app hash routes may be returned to after Google sends the person back. */
export function safeReturn(hash: string | null | undefined): string {
  return hash && /^#\/[A-Za-z0-9/_?=&-]*$/.test(hash) && !hash.startsWith('#/signin') ? hash : '#/tonight';
}

/**
 * Leave for Google's account chooser. Supabase sends the person back to this page's origin and
 * path (allow-listed on the project) with a one-time ?code= that the client swaps for a session (PKCE).
 */
export async function startGoogle(returnTo: string): Promise<void> {
  const client = supabase();
  if (!client) throw new Error('offline');
  sessionStorage.setItem(AFTER, safeReturn(returnTo));
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

/**
 * Tidy the address bar after Google's round trip: drop ?code= / ?error= and go back to the
 * screen the person started from. A refusal or cancel is kept for the sign-in screen to show.
 */
export function finishReturn(loc: Location = window.location, hist: History = window.history): void {
  const q = new URLSearchParams(loc.search);
  if (!q.has('code') && !q.has('error') && !q.has('error_description')) return;
  const failed = q.get('error_description') || q.get('error');
  if (failed) sessionStorage.setItem(RETURN_ERROR, failed.slice(0, 200));
  const after = failed ? '#/signin' : safeReturn(sessionStorage.getItem(AFTER));
  sessionStorage.removeItem(AFTER);
  hist.replaceState(null, '', loc.pathname + after);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** A refusal Google or Supabase sent back, shown once on the sign-in screen. */
export function takeReturnError(): string | null {
  const v = sessionStorage.getItem(RETURN_ERROR);
  if (v) sessionStorage.removeItem(RETURN_ERROR);
  return v;
}
