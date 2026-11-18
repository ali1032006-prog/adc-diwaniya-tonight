// Email + password sign-up and sign-in next to Google (Ali's ruling ADC-LOG-802, "Use supabase's one"):
// Supabase's built-in mailer, confirm email ON, password reset, the same 18+ and Terms steps, and a
// clear message when the free mailer's hourly limit is hit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { COPY } from './lib/copy';

type R = { data: unknown; error: unknown };
const ok: R = { data: {}, error: null };
const sb = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async (): Promise<R> => ({ data: {}, error: null })),
  signUp: vi.fn(async (_a: unknown): Promise<R> => ({ data: {}, error: null })),
  signInWithPassword: vi.fn(async (_a: unknown): Promise<R> => ({ data: {}, error: null })),
  resend: vi.fn(async (_a: unknown): Promise<R> => ({ data: {}, error: null })),
  resetPasswordForEmail: vi.fn(async (_e: string, _o: unknown): Promise<R> => ({ data: {}, error: null })),
  updateUser: vi.fn(async (_a: unknown): Promise<R> => ({ data: {}, error: null })),
}));
vi.mock('./lib/supabase', () => ({ supabase: () => ({ auth: sb }), setSupabaseForTests: () => {} }));

const auth = await import('./lib/auth');
const { SignIn } = await import('./screens/SignIn');
const { NewPassword, ltr } = await import('./components/EmailAuth');

const en = COPY.en;
const ar = COPY.ar;
const base: SessionCtx = {
  status: 'signedOut',
  userId: null,
  email: null,
  provider: null,
  profile: null,
  priv: null,
  refresh: async () => {},
  signOut: async () => {},
};

function ui(node: React.ReactNode, session: Partial<SessionCtx> = {}, prefs: Partial<Prefs> = {}) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, lang: 'en', ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={{ ...base, ...session }}>{node}</SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

const authErr = (code: string, status: number, message = code) => Object.assign(new Error(message), { name: 'AuthApiError', code, status });
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yearsAgo = (y: number) => {
  const t = new Date();
  return ymd(new Date(t.getFullYear() - y, t.getMonth(), t.getDate()));
};
const back = window.location.origin + window.location.pathname;

function fillCreds(container: HTMLElement, email: string, password: string) {
  fireEvent.change(container.querySelector('input[type=email]') as HTMLInputElement, { target: { value: email } });
  fireEvent.change(container.querySelector('input[autocomplete$=password]') as HTMLInputElement, { target: { value: password } });
}

function register(container: HTMLElement, birth = yearsAgo(30), terms = true) {
  fireEvent.click(screen.getByRole('tab', { name: en.signin.tabRegister }));
  fireEvent.change(container.querySelector('input[type=date]') as HTMLInputElement, { target: { value: birth } });
  if (terms) fireEvent.click(container.querySelector('.consent input[type=checkbox]') as HTMLInputElement);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  Object.values(sb).forEach((f) => {
    f.mockReset();
    f.mockResolvedValue(ok);
  });
  window.location.hash = '';
});
afterEach(cleanup);

describe('auth error sorting', () => {
  it('names the free mailer limit, an unconfirmed address and a wrong login apart', () => {
    expect(auth.authProblem(authErr('over_email_send_rate_limit', 429, 'email rate limit exceeded'))).toBe('mailLimit');
    expect(auth.authProblem({ message: 'Email rate limit exceeded', status: 429 })).toBe('mailLimit');
    expect(auth.authProblem(authErr('over_request_rate_limit', 429))).toBe('tooFast');
    expect(auth.authProblem(authErr('email_not_confirmed', 400, 'Email not confirmed'))).toBe('notConfirmed');
    expect(auth.authProblem(authErr('invalid_credentials', 400, 'Invalid login credentials'))).toBe('badLogin');
    expect(auth.authProblem(authErr('weak_password', 422))).toBe('weakPassword');
    expect(auth.authProblem(authErr('email_address_invalid', 400))).toBe('badEmail');
    expect(auth.authProblem(authErr('email_address_not_authorized', 400))).toBe('mailFailed');
    expect(auth.authProblem(new Error('offline'))).toBe('offline');
    expect(auth.authProblem(null)).toBe('unknown');
  });
  it('every problem has words in both languages', () => {
    for (const k of Object.keys(en.signin.problems) as (keyof typeof en.signin.problems)[]) {
      expect(en.signin.problems[k].length).toBeGreaterThan(10);
      expect(ar.signin.problems[k].length).toBeGreaterThan(10);
    }
  });
});

describe('register with email', () => {
  it('waits for the age and the Terms, like Google', () => {
    const { container } = ui(<SignIn mode="signin" />);
    fireEvent.click(screen.getByRole('tab', { name: en.signin.tabRegister }));
    fillCreds(container, 'new@example.org', 'long-enough-pw');
    const btn = screen.getByRole('button', { name: en.signin.emailSignUp }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.change(container.querySelector('input[type=date]') as HTMLInputElement, { target: { value: yearsAgo(17) } });
    fireEvent.click(container.querySelector('.consent input[type=checkbox]') as HTMLInputElement);
    expect(btn.disabled).toBe(true); // 17 is too young
    fireEvent.change(container.querySelector('input[type=date]') as HTMLInputElement, { target: { value: yearsAgo(30) } });
    expect(btn.disabled).toBe(false);
  });

  it('a short password keeps the button off', () => {
    const { container } = ui(<SignIn mode="signin" />);
    register(container);
    fillCreds(container, 'new@example.org', 'short');
    expect((screen.getByRole('button', { name: en.signin.emailSignUp }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the trimmed address with the link back to this page, keeps the age and Terms, then says check your email', async () => {
    const { container } = ui(<SignIn mode="register" from="league" />);
    register(container);
    fillCreds(container, '  new@example.org ', 'long-enough-pw');
    fireEvent.click(screen.getByRole('button', { name: en.signin.emailSignUp }));
    await waitFor(() => expect(sb.signUp).toHaveBeenCalledTimes(1));
    expect(sb.signUp.mock.calls[0][0]).toEqual({
      email: 'new@example.org',
      password: 'long-enough-pw',
      options: { emailRedirectTo: back },
    });
    expect(auth.pendingRegister()).toEqual({ birth: yearsAgo(30), terms: true });
    await screen.findByText(en.signin.checkTitle);
    expect(screen.getByText(en.signin.checkBody(ltr('new@example.org')))).toBeTruthy();
    // the resend waits out the cooldown first
    expect((screen.getByRole('button', { name: /ask again in/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('input[type=password]')).toBeNull();
  });

  it('says plainly when the free mailer has hit its hourly limit', async () => {
    sb.signUp.mockResolvedValueOnce({ data: {}, error: authErr('over_email_send_rate_limit', 429, 'email rate limit exceeded') });
    const { container } = ui(<SignIn mode="register" />);
    register(container);
    fillCreds(container, 'new@example.org', 'long-enough-pw');
    fireEvent.click(screen.getByRole('button', { name: en.signin.emailSignUp }));
    expect((await screen.findByRole('alert')).textContent).toContain(en.signin.problems.mailLimit);
    expect(screen.queryByText(en.signin.checkTitle)).toBeNull();
  });

  it('the hourly-limit message is in Arabic too', async () => {
    sb.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: authErr('over_email_send_rate_limit', 429) });
    ui(<SignIn mode="signin" />, {}, { lang: 'ar' });
    fireEvent.click(screen.getByRole('button', { name: ar.signin.forgot }));
    fireEvent.change(document.querySelector('input[type=email]') as HTMLInputElement, { target: { value: 'a@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: ar.signin.resetSend }));
    expect((await screen.findByRole('alert')).textContent).toContain(ar.signin.problems.mailLimit);
  });
});

describe('sign in with email', () => {
  it('signs in and goes where the person was heading', async () => {
    const { container } = ui(<SignIn mode="signin" from="me" />);
    fillCreds(container, ' me@example.org ', 'my-password');
    fireEvent.click(screen.getByRole('button', { name: en.signin.emailSignIn }));
    await waitFor(() => expect(sb.signInWithPassword).toHaveBeenCalledWith({ email: 'me@example.org', password: 'my-password' }));
    await waitFor(() => expect(window.location.hash).toBe('#/me'));
  });

  it('one message for a wrong email or password', async () => {
    sb.signInWithPassword.mockResolvedValueOnce({ data: {}, error: authErr('invalid_credentials', 400, 'Invalid login credentials') });
    const { container } = ui(<SignIn mode="signin" />);
    fillCreds(container, 'me@example.org', 'nope-nope');
    fireEvent.click(screen.getByRole('button', { name: en.signin.emailSignIn }));
    expect((await screen.findByRole('alert')).textContent).toContain(en.signin.problems.badLogin);
    expect(window.location.hash).toBe('');
  });

  it('an unconfirmed address is told so and can ask for the link again', async () => {
    sb.signInWithPassword.mockResolvedValueOnce({ data: {}, error: authErr('email_not_confirmed', 400, 'Email not confirmed') });
    const { container } = ui(<SignIn mode="signin" />);
    fillCreds(container, 'me@example.org', 'my-password');
    fireEvent.click(screen.getByRole('button', { name: en.signin.emailSignIn }));
    expect((await screen.findByRole('alert')).textContent).toContain(en.signin.problems.notConfirmed);
    fireEvent.click(screen.getByRole('button', { name: en.signin.resend }));
    await waitFor(() => expect(sb.resend).toHaveBeenCalledWith({ type: 'signup', email: 'me@example.org', options: { emailRedirectTo: back } }));
    await screen.findByText(en.signin.resent);
    expect((screen.getByRole('button', { name: /ask again in/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the password can be shown and hidden', () => {
    const { container } = ui(<SignIn mode="signin" />);
    const toggle = screen.getByRole('button', { name: en.signin.show });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('input[autocomplete=current-password]')?.getAttribute('type')).toBe('text');
    fireEvent.click(toggle);
    expect(container.querySelector('input[autocomplete=current-password]')?.getAttribute('type')).toBe('password');
  });
});

describe('password reset', () => {
  it('mails a reset link that comes back marked as a reset, with the same answer for any address', async () => {
    const { container } = ui(<SignIn mode="signin" />);
    fillCreds(container, 'me@example.org', '');
    fireEvent.click(screen.getByRole('button', { name: en.signin.forgot }));
    expect((container.querySelector('input[type=email]') as HTMLInputElement).value).toBe('me@example.org');
    fireEvent.click(screen.getByRole('button', { name: en.signin.resetSend }));
    await waitFor(() => expect(sb.resetPasswordForEmail).toHaveBeenCalledWith('me@example.org', { redirectTo: back + '?reset=1' }));
    await screen.findByText(en.signin.resetSent(ltr('me@example.org')));
    fireEvent.click(screen.getByRole('button', { name: en.signin.back }));
    expect(screen.getByRole('button', { name: en.signin.emailSignIn })).toBeTruthy();
  });

  it('after the link, the new password is saved on the recovery session', async () => {
    const endRecovery = vi.fn();
    const { container } = ui(<NewPassword />, { status: 'ready', recovery: true, endRecovery });
    const save = screen.getByRole('button', { name: en.signin.newPwSave }) as HTMLButtonElement;
    fireEvent.change(container.querySelector('input[autocomplete=new-password]') as HTMLInputElement, { target: { value: 'short' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(container.querySelector('input[autocomplete=new-password]') as HTMLInputElement, { target: { value: 'a-new-long-one' } });
    fireEvent.click(save);
    await waitFor(() => expect(sb.updateUser).toHaveBeenCalledWith({ password: 'a-new-long-one' }));
    await screen.findByText(en.signin.newPwDone);
    fireEvent.click(screen.getByRole('button', { name: en.signin.newPwNext }));
    expect(endRecovery).toHaveBeenCalledTimes(1);
  });
});

describe('links that come back', () => {
  it('an expired link in the fragment never reaches the router and is explained on sign-in', () => {
    const hist = { replaceState: vi.fn() } as unknown as History;
    const loc = {
      search: '',
      pathname: '/',
      hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    } as Location;
    auth.finishReturn(loc, hist);
    expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/#/signin');
    expect(auth.takeReturnError()).toBe(auth.LINK_EXPIRED);
  });

  it('a link opened in another browser (code but no session) says the address may already be confirmed', () => {
    auth.noteLinkWithoutSession(true, false);
    ui(<SignIn mode="signin" />);
    expect(screen.getByRole('alert').textContent).toContain(en.signin.linkElsewhere);
  });

  it('a link that did sign in leaves no note', () => {
    auth.noteLinkWithoutSession(true, true);
    auth.noteLinkWithoutSession(false, false);
    expect(auth.takeReturnError()).toBeNull();
  });
});
