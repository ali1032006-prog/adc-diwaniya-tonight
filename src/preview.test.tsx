// Preview-only test-account sign-in (Ali's ruling on Agent Issue 52, ADC-LOG-775).
// The form signs in with a password; the normal build must not show it (the bundle grep in
// scripts/check_prod_bundle.sh proves the module is gone from dist; this proves the gate in the UI).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';

const pw = vi.hoisted(() => vi.fn(async (_: { email: string; password: string }) => ({ data: {}, error: null as null | { message: string } })));
const oauth = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
vi.mock('./lib/supabase', () => ({
  supabase: () => ({ auth: { signInWithPassword: pw, signInWithOAuth: oauth } }),
  setSupabaseForTests: () => {},
}));

const { default: TestSignIn, PREVIEW_SIGNIN_MARKER } = await import('./preview/TestSignIn');
const { SignIn } = await import('./screens/SignIn');

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

function ui(node: React.ReactNode, prefs: Partial<Prefs> = {}) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, lang: 'en', ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={base}>{node}</SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

beforeEach(() => {
  pw.mockClear();
  window.location.hash = '#/signin';
});
afterEach(cleanup);

describe('preview test-account sign-in gate', () => {
  it('the normal build has the flag off and the sign-in screen shows no password form', () => {
    expect(__PREVIEW_SIGNIN__).toBe(false);
    const { container } = ui(<SignIn mode="signin" />);
    expect(container.querySelector(`[data-marker="${PREVIEW_SIGNIN_MARKER}"]`)).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/test account/i)).toBeNull();
  });

  it('signs in with the trimmed email and goes to the screen the person came from', async () => {
    const { container } = ui(<TestSignIn from="me" />);
    fireEvent.change(screen.getByLabelText('Test email'), { target: { value: '  vi.user.test@example.com ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with test account' }));
    await waitFor(() => expect(pw).toHaveBeenCalledTimes(1));
    expect(pw.mock.calls[0][0]).toEqual({ email: 'vi.user.test@example.com', password: 'not-a-real-one' });
    await waitFor(() => expect(window.location.hash).toBe('#/me'));
    expect((container.querySelector('input[type="password"]') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
  });

  it('a refusal shows one message that does not say which half was wrong, and clears the password', async () => {
    pw.mockResolvedValueOnce({ data: {}, error: { message: 'Invalid login credentials' } });
    ui(<TestSignIn />);
    fireEvent.change(screen.getByLabelText('Test email'), { target: { value: 'jayce.user.test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with test account' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("That didn't work. Check the email and password.");
    expect(alert.textContent).not.toMatch(/Invalid login credentials/);
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    expect(window.location.hash).toBe('#/signin');
  });

  it('has no sign-up path and speaks Arabic in Arabic', () => {
    ui(<TestSignIn />, { lang: 'ar' });
    expect(screen.getByText('حسابات الاختبار (نسخ المعاينة فقط)')).toBeTruthy();
    expect(screen.queryByText(/sign up|register|اشتراك|تسجيل حساب/i)).toBeNull();
  });
});
