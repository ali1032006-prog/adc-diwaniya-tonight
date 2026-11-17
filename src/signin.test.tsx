// S2 Sign in and Register + S3 profile setup (ADC-TSK-36 sign-in slice).
// Ali's rulings ADC-LOG-696/697: A Google only, B 18+, C men only (the Terms say it). No male
// checkbox since Ali's order ADC-LOG-751.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { COPY } from './lib/copy';
import { parseHash, href, currentFrom } from './lib/router';

const oauth = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
vi.mock('./lib/supabase', () => ({
  supabase: () => ({ auth: { signInWithOAuth: oauth } }),
  setSupabaseForTests: () => {},
}));
const api = vi.hoisted(() => ({ completeProfile: vi.fn(async () => {}) }));
vi.mock('./lib/api', async (importActual) => ({ ...(await importActual<typeof import('./lib/api')>()), ...api }));

const auth = await import('./lib/auth');
const { SignIn } = await import('./screens/SignIn');
const { Terms } = await import('./screens/Terms');
const { ProfileSetup, SignInGate } = await import('./components/account');

const en = COPY.en;
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

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yearsAgo = (y: number, plusDays = 0) => {
  const t = new Date();
  return ymd(new Date(t.getFullYear() - y, t.getMonth(), t.getDate() + plusDays));
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  oauth.mockClear();
  api.completeProfile.mockClear();
});
afterEach(cleanup);

describe('age gate helpers (ruling B)', () => {
  it('18 today is in, one day short is out', () => {
    expect(auth.isAdult(yearsAgo(18))).toBe(true);
    expect(auth.isAdult(yearsAgo(18, 1))).toBe(false);
    expect(auth.ageOn('2000-02-29', new Date(2018, 1, 28))).toBe(17);
    expect(auth.ageOn('2000-02-29', new Date(2018, 2, 1))).toBe(18);
  });
  it('rejects nonsense dates', () => {
    expect(auth.isAdult('')).toBe(false);
    expect(auth.isAdult('1899-12-31')).toBe(false);
    expect(auth.isAdult('1990-13-01')).toBe(false);
    expect(auth.isAdult('<script>')).toBe(false);
  });
  it('the date picker stops at the last birthday that is 18 today', () => {
    expect(auth.maxBirthDate(new Date(2026, 10, 17))).toBe('2008-11-17');
  });
});

describe('return after Google', () => {
  it('only in-app hash routes are returned to', () => {
    expect(auth.safeReturn('#/league')).toBe('#/league');
    expect(auth.safeReturn('#/d/22222222-2222-4222-8222-222222222222')).toBe('#/d/22222222-2222-4222-8222-222222222222');
    expect(auth.safeReturn('https://evil.example/')).toBe('#/tonight');
    expect(auth.safeReturn('#/x"><img src=x>')).toBe('#/tonight');
    expect(auth.safeReturn('#/signin?mode=register')).toBe('#/tonight');
    expect(auth.safeReturn(null)).toBe('#/tonight');
  });
  it('strips ?code= and goes back to where sign-in started', () => {
    sessionStorage.setItem('dt.after-signin.v1', '#/league');
    const replace = vi.fn();
    auth.finishReturn({ search: '?code=abc', pathname: '/' } as Location, { replaceState: replace } as unknown as History);
    expect(replace).toHaveBeenCalledWith(null, '', '/#/league');
    expect(auth.takeReturnError()).toBeNull();
  });
  it('a cancelled Google sign-in lands back on S2 with a note', () => {
    const replace = vi.fn();
    auth.finishReturn(
      { search: '?error=access_denied&error_description=User+cancelled', pathname: '/' } as Location,
      { replaceState: replace } as unknown as History,
    );
    expect(replace).toHaveBeenCalledWith(null, '', '/#/signin');
    expect(auth.takeReturnError()).toBe('User cancelled');
    expect(auth.takeReturnError()).toBeNull();
  });
  it('does nothing on an ordinary load', () => {
    const replace = vi.fn();
    auth.finishReturn({ search: '', pathname: '/' } as Location, { replaceState: replace } as unknown as History);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('routes', () => {
  it('parses S2 modes, a safe `from`, and the Terms page', () => {
    expect(parseHash('#/signin')).toEqual({ name: 'signin', mode: 'signin' });
    expect(parseHash('#/signin?mode=register&from=league')).toEqual({ name: 'signin', mode: 'register', from: 'league' });
    expect(parseHash('#/signin?from=javascript:alert(1)')).toEqual({ name: 'signin', mode: 'signin' });
    expect(parseHash('#/terms')).toEqual({ name: 'terms' });
    expect(href.signin('register', 'd/22222222-2222-4222-8222-222222222222')).toBe(
      '#/signin?mode=register&from=d%2F22222222-2222-4222-8222-222222222222',
    );
    expect(parseHash(href.signin('register', 'd/22222222-2222-4222-8222-222222222222'))).toMatchObject({
      from: 'd/22222222-2222-4222-8222-222222222222',
    });
    expect(currentFrom('#/league')).toBe('league');
    expect(currentFrom('#/signin?mode=register')).toBeUndefined();
  });
});

describe('S2 Sign in and Register', () => {
  it('has no email or password form anywhere (ruling A)', () => {
    const { container } = ui(<SignIn mode="signin" />);
    expect(container.querySelector('input[type=password], input[type=email]')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: en.signin.tabRegister }));
    expect(container.querySelector('input[type=password], input[type=email]')).toBeNull();
  });

  it('Sign in goes straight to Google with the account chooser', async () => {
    ui(<SignIn mode="signin" from="league" />);
    fireEvent.click(screen.getByRole('button', { name: en.signin.google }));
    await waitFor(() => expect(oauth).toHaveBeenCalledTimes(1));
    expect(oauth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
    });
    expect(sessionStorage.getItem('dt.after-signin.v1')).toBe('#/league');
    expect(localStorage.getItem('dt.welcomed.v1')).toBe('1');
  });

  it('Register keeps Google shut until 18+ and the Terms are given, and asks nothing else', async () => {
    const { container } = ui(<SignIn mode="register" />);
    const google = screen.getByRole('button', { name: en.signin.googleUp });
    expect((google as HTMLButtonElement).disabled).toBe(true);
    // Ali's order ADC-LOG-751: the Terms are the only checkbox.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText(/I confirm I am a man/)).toBeNull();
    const date = container.querySelector('input[type=date]') as HTMLInputElement;
    fireEvent.change(date, { target: { value: yearsAgo(17) } });
    expect(screen.getByText(en.profile.tooYoung)?.getAttribute('class')).toBe('field__hint field__hint--error');
    expect(date?.getAttribute('aria-invalid')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: /Terms and Privacy Policy/ }));
    expect((google as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(date, { target: { value: yearsAgo(30) } });
    expect((google as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /Terms and Privacy Policy/ }));
    expect((google as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Terms and Privacy Policy/ }));
    fireEvent.click(google);
    await waitFor(() => expect(oauth).toHaveBeenCalledTimes(1));
    expect(auth.pendingRegister()).toEqual({ birth: yearsAgo(30), terms: true });
  });

  it('the Terms link opens in a new tab so the form is kept', () => {
    ui(<SignIn mode="register" />);
    const link = screen.getByRole('link', { name: en.profile.termsLink });
    expect(link?.getAttribute('href')).toBe('#/terms');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('tabs switch with the keyboard and the pill follows', () => {
    const { container } = ui(<SignIn mode="signin" />);
    const first = screen.getByRole('tab', { name: en.signin.tabSignIn });
    expect(first?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: en.signin.tabRegister })?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.signin__tabs')?.getAttribute('data-active')).toBe('register');
  });

  it('shows a note when Google sent the person back without signing in', () => {
    sessionStorage.setItem('dt.signin-error.v1', 'access_denied');
    ui(<SignIn mode="signin" />);
    expect(screen.getByRole('alert')?.textContent).toContain(en.signin.returnError);
  });

  it('a new Google account goes on to profile setup', () => {
    ui(<SignIn mode="signin" />, { status: 'needsProfile', userId: 'u1', provider: 'google' });
    expect(screen.getByRole('heading', { name: en.gate.profileTitle, level: 2 })).toBeTruthy();
  });

  it('works in Arabic too', () => {
    ui(<SignIn mode="signin" />, {}, { lang: 'ar' });
    expect(screen.getByRole('button', { name: COPY.ar.signin.google })).toBeTruthy();
  });
});

describe('S3 profile setup', () => {
  it('fills in what Register collected and sends no male confirmation', async () => {
    auth.savePendingRegister({ birth: '1990-04-04', terms: true });
    const refresh = vi.fn(async () => {});
    ui(<ProfileSetup />, { status: 'needsProfile', userId: 'u1', refresh });
    fireEvent.change(screen.getByLabelText(en.profile.name), { target: { value: 'Faisal' } });
    fireEvent.change(screen.getByLabelText(en.profile.area, { exact: false }), { target: { value: 'Salmiya' } });
    expect((screen.getByRole('checkbox', { name: /Terms and Privacy Policy/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: en.profile.finish }));
    await waitFor(() => expect(api.completeProfile).toHaveBeenCalledWith('Faisal', 'Salmiya', '1990-04-04', true));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(auth.pendingRegister()).toBeNull();
  });

  it('starts with name, area, 18+ and the Terms, and has no male checkbox', () => {
    const { container } = ui(<ProfileSetup />, { status: 'needsProfile', userId: 'u1' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(en.profile.name), { target: { value: 'Faisal' } });
    fireEvent.change(screen.getByLabelText(en.profile.area, { exact: false }), { target: { value: 'Salmiya' } });
    fireEvent.change(container.querySelector('input[type=date]') as HTMLInputElement, { target: { value: '1990-04-04' } });
    expect((screen.getByRole('button', { name: en.profile.finish }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Terms and Privacy Policy/ }));
    expect((screen.getByRole('button', { name: en.profile.finish }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('gate and Terms', () => {
  it('the gate offers Sign in and New account, coming back to this screen', () => {
    window.location.hash = '#/league';
    ui(<SignInGate />);
    expect(screen.getByRole('link', { name: en.gate.signIn })?.getAttribute('href')).toBe('#/signin?mode=signin&from=league');
    expect(screen.getByRole('link', { name: en.gate.register })?.getAttribute('href')).toBe('#/signin?mode=register&from=league');
  });

  it('the Terms say men only and 18+ in both languages (rulings B and C)', () => {
    ui(<Terms />);
    expect(screen.getByText(/for men aged 18 and over, and every diwaniya on it is for men only/)).toBeTruthy();
    cleanup();
    ui(<Terms />, {}, { lang: 'ar' });
    expect(screen.getByText(/للرجال من عمر ١٨ سنة فأكثر، وكل الديوانيات فيه للرجال فقط/)).toBeTruthy();
  });
});
