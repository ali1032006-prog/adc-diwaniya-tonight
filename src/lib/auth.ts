import { supabase } from './supabase';

// Sign-in for Diwaniyatna: Google (Ali's ruling A, ADC-LOG-696) or an email and a password
// (Ali's ruling ADC-LOG-802), both through Supabase Auth.

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
  // Supabase puts a refused or expired email link's error in the fragment on some paths; the hash
  // router must never see it as a route.
  const h = /^#(error|error_code|error_description)=/.test(loc.hash) ? new URLSearchParams(loc.hash.slice(1)) : null;
  if (!q.has('code') && !q.has('error') && !q.has('error_description') && !h) return;
  const code = q.get('error_code') || h?.get('error_code');
  const failed = q.get('error_description') || q.get('error') || h?.get('error_description') || h?.get('error');
  if (failed) sessionStorage.setItem(RETURN_ERROR, code === 'otp_expired' ? LINK_EXPIRED : failed.slice(0, 200));
  const after = failed ? '#/signin' : safeReturn(sessionStorage.getItem(AFTER));
  sessionStorage.removeItem(AFTER);
  hist.replaceState(null, '', loc.pathname + after);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** An email link that Supabase refused as used or expired. */
export const LINK_EXPIRED = 'dt:link-expired';

// ---------------------------------------------------------------------------------------------
// Email + password (Ali's ruling ADC-LOG-802: "Use supabase's one"). Supabase's built-in mailer
// sends the confirmation and reset links (ADC-LOG-621); "confirm email" stays ON on the project,
// so nobody gets in with an address they don't own. The links come back to this page with a
// one-time ?code= (PKCE), which only works in the browser that asked for it.
// ---------------------------------------------------------------------------------------------

export const PASSWORD_MIN = 8; // same as the project's password_min_length

/** Where Supabase's confirm and reset links send the person back to (allow-listed on the project). */
export function linkBack(): string {
  return window.location.origin + window.location.pathname;
}

export type AuthProblem =
  | 'mailLimit' // Supabase's free mailer: a couple of emails an hour for the whole app
  | 'tooFast' // too many auth requests from this connection
  | 'notConfirmed' // signed up but hasn't opened the confirmation link yet
  | 'badLogin' // wrong email or password (never says which)
  | 'weakPassword'
  | 'badEmail'
  | 'mailFailed' // the mailer refused or failed to send
  | 'offline'
  | 'unknown';

/** Sort a Supabase Auth error into the few messages the sign-in screen shows. */
export function authProblem(e: unknown): AuthProblem {
  const o = (e ?? {}) as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };
  const code = typeof o.code === 'string' ? o.code : '';
  const msg = typeof o.message === 'string' ? o.message : '';
  if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(msg)) return 'mailLimit';
  if (code === 'over_request_rate_limit' || code === 'over_sms_send_rate_limit' || o.status === 429) return 'tooFast';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'notConfirmed';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'badLogin';
  if (code === 'weak_password' || /password should/i.test(msg)) return 'weakPassword';
  if (code === 'email_address_invalid' || code === 'validation_failed' || /unable to validate email|invalid format/i.test(msg)) return 'badEmail';
  if (code === 'email_address_not_authorized' || /error sending .*email/i.test(msg)) return 'mailFailed';
  if (msg === 'offline' || o.name === 'AuthRetryableFetchError' || (e instanceof TypeError && /fetch/i.test(msg))) return 'offline';
  return 'unknown';
}

function client_() {
  const client = supabase();
  if (!client) throw new Error('offline');
  return client;
}

/**
 * Register with an email and a password. Supabase mails a confirmation link; there is no session
 * until it is opened. For an address that already has an account Supabase answers the same way and
 * sends nothing, so the screen never tells a stranger which addresses are registered.
 */
export async function signUpWithEmail(email: string, password: string, returnTo: string): Promise<void> {
  const client = client_();
  sessionStorage.setItem(AFTER, safeReturn(returnTo));
  const { error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: linkBack() },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await client_().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Mail the confirmation link again (counts against the same hourly mail limit). */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await client_().auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: linkBack() },
  });
  if (error) throw error;
}

/** Mail a reset link. Same answer whether or not the address has an account. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client_().auth.resetPasswordForEmail(email.trim(), { redirectTo: linkBack() + '?reset=1' });
  if (error) throw error;
}

/** After a reset link: set the new password on the recovery session. */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await client_().auth.updateUser({ password });
  if (error) throw error;
}

/** A link (confirm or reset) that came back without a session: opened in another browser, or expired. */
export const LINK_ELSEWHERE = 'dt:link-elsewhere';

/**
 * Called after getSession: a ?code= that did not turn into a session means the link was opened in a
 * different browser (the PKCE verifier lives in the one that asked) or had expired. A confirmation
 * link has still confirmed the address on Supabase's side before coming back, so the sign-in
 * screen says so and offers the password form.
 */
export function noteLinkWithoutSession(hadCode: boolean, signedIn: boolean): void {
  if (hadCode && !signedIn && !sessionStorage.getItem(RETURN_ERROR)) sessionStorage.setItem(RETURN_ERROR, LINK_ELSEWHERE);
}

/** A refusal Google or Supabase sent back, shown once on the sign-in screen. */
export function takeReturnError(): string | null {
  const v = sessionStorage.getItem(RETURN_ERROR);
  if (v) sessionStorage.removeItem(RETURN_ERROR);
  return v;
}
