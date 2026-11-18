import { useEffect, useId, useState } from 'react';
import { Eye, EyeSlash, EnvelopeSimpleOpen } from '@phosphor-icons/react';
import { ErrorNote, OkNote } from './ui';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import {
  PASSWORD_MIN,
  authProblem,
  resendConfirmation,
  safeReturn,
  sendPasswordReset,
  setNewPassword,
  signInWithEmail,
  signUpWithEmail,
  type AuthProblem,
} from '../lib/auth';

// Email + password next to Google (Ali's ruling ADC-LOG-802, "Use supabase's one"). Supabase's
// built-in mailer sends confirm and reset links: about two emails an hour for the whole app, so the
// limit gets its own clear message and every send button waits out a cooldown after use.

const RESEND_AFTER_S = 60;

/** An address inside a sentence stays one left-to-right run, also in Arabic (Unicode LRI ... PDI). */
export const ltr = (s: string) => `\u2066${s}\u2069`;

function useProblem() {
  const { c } = usePrefs();
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  return {
    problem,
    text: problem ? c.signin.problems[problem] : null,
    set: (e: unknown) => setProblem(authProblem(e)),
    clear: () => setProblem(null),
  };
}

function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { c } = usePrefs();
  return (
    <label className="field">
      <span className="field__label">{c.signin.email}</span>
      <input
        className="input"
        type="email"
        inputMode="email"
        required
        maxLength={254}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function PasswordField({
  value,
  onChange,
  label,
  autoComplete,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
}) {
  const { c } = usePrefs();
  const [shown, setShown] = useState(false);
  const hintId = useId();
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="pw" dir="ltr">
        <input
          className="input pw__input"
          type={shown ? 'text' : 'password'}
          required
          minLength={autoComplete === 'new-password' ? PASSWORD_MIN : undefined}
          maxLength={72}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          dir="ltr"
          aria-describedby={hint ? hintId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="pw__toggle"
          aria-label={c.signin.show}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeSlash size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </span>
      {hint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
    </label>
  );
}

/** Counts down RESEND_AFTER_S seconds once started (or from the first render); 0 = free to send again. */
function useCooldown(startNow = false) {
  const [left, setLeft] = useState(startNow ? RESEND_AFTER_S : 0);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return { left, start: () => setLeft(RESEND_AFTER_S) };
}

export function Divider() {
  const { c } = usePrefs();
  return (
    <p className="signin__or" role="separator">
      <span>{c.signin.or}</span>
    </p>
  );
}

/** Sign in tab: email + password, with the way to a reset link and to resend a confirmation. */
export function EmailSignIn({ from, onForgot }: { from?: string; onForgot: (email: string) => void }) {
  const { c } = usePrefs();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const p = useProblem();
  const cool = useCooldown();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    p.clear();
    setResent(false);
    try {
      await signInWithEmail(email, password);
      setPassword('');
      window.location.hash = safeReturn(from ? `#/${from}` : '#/tonight');
    } catch (err) {
      p.set(err);
      setUnconfirmed(authProblem(err) === 'notConfirmed');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cool.left > 0 || busy) return;
    setBusy(true);
    try {
      await resendConfirmation(email);
      setResent(true);
      p.clear();
      cool.start();
    } catch (err) {
      p.set(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)} data-testid="email-signin">
      <EmailField value={email} onChange={setEmail} />
      <PasswordField value={password} onChange={setPassword} label={c.signin.password} autoComplete="current-password" />
      {p.text && <ErrorNote text={p.text} />}
      {resent && <OkNote text={c.signin.resent} />}
      {unconfirmed && (
        <button type="button" className="btn btn--quiet" disabled={busy || cool.left > 0} onClick={() => void resend()}>
          {cool.left > 0 ? c.signin.resendIn(String(cool.left)) : c.signin.resend}
        </button>
      )}
      <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy || undefined}>
        {busy ? c.signin.busy : c.signin.emailSignIn}
      </button>
      <button type="button" className="btn btn--text signin__forgot" onClick={() => onForgot(email)}>
        {c.signin.forgot}
      </button>
    </form>
  );
}

/** Register tab: email + password once the age and the Terms are done; then "check your email". */
export function EmailRegister({ ready, from, onBeforeSend }: { ready: boolean; from?: string; onBeforeSend: () => void }) {
  const { c } = usePrefs();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const p = useProblem();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !ready) return;
    setBusy(true);
    p.clear();
    try {
      onBeforeSend();
      await signUpWithEmail(email, password, from ? `#/${from}` : '#/tonight');
      setPassword('');
      setSentTo(email.trim());
    } catch (err) {
      p.set(err);
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) return <CheckInbox email={sentTo} />;

  return (
    <form className="form" onSubmit={(e) => void submit(e)} data-testid="email-register">
      <EmailField value={email} onChange={setEmail} />
      <PasswordField
        value={password}
        onChange={setPassword}
        label={c.signin.password}
        autoComplete="new-password"
        hint={c.signin.passwordHint}
      />
      {p.text && <ErrorNote text={p.text} />}
      <button
        type="submit"
        className="btn btn--primary"
        disabled={!ready || busy || password.length < PASSWORD_MIN}
        aria-busy={busy || undefined}
      >
        {busy ? c.signin.busy : c.signin.emailSignUp}
      </button>
    </form>
  );
}

/** After sign-up: where the link went, and a resend that waits out the cooldown. */
export function CheckInbox({ email }: { email: string }) {
  const { c } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const p = useProblem();
  const cool = useCooldown(true); // the first link has just gone out

  const resend = async () => {
    if (cool.left > 0 || busy) return;
    setBusy(true);
    p.clear();
    setResent(false);
    try {
      await resendConfirmation(email);
      setResent(true);
      cool.start();
    } catch (err) {
      p.set(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin__check" aria-live="polite" data-testid="check-inbox">
      <EnvelopeSimpleOpen size={40} aria-hidden="true" className="signin__check-icon" />
      <h3 className="signin__lead">{c.signin.checkTitle}</h3>
      <p>
        <bdi>{c.signin.checkBody(ltr(email))}</bdi>
      </p>
      <p className="muted">{c.signin.checkNote}</p>
      {p.text && <ErrorNote text={p.text} />}
      {resent && <OkNote text={c.signin.resent} />}
      <button type="button" className="btn btn--quiet" disabled={busy || cool.left > 0} onClick={() => void resend()}>
        {cool.left > 0 ? c.signin.resendIn(String(cool.left)) : c.signin.resend}
      </button>
    </div>
  );
}

/** "Forgot your password?": one email field, one send, the same answer for every address. */
export function ResetRequest({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const { c } = usePrefs();
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const p = useProblem();
  const cool = useCooldown();
  const titleId = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || cool.left > 0) return;
    setBusy(true);
    p.clear();
    try {
      await sendPasswordReset(email);
      setSentTo(email.trim());
      cool.start();
    } catch (err) {
      p.set(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel signin__panel" aria-labelledby={titleId} data-testid="reset-request">
      <h2 id={titleId} className="signin__lead">
        {c.signin.resetLead}
      </h2>
      <p className="muted">{c.signin.resetBody}</p>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <EmailField value={email} onChange={setEmail} />
        {p.text && <ErrorNote text={p.text} />}
        {sentTo && <OkNote text={c.signin.resetSent(ltr(sentTo))} />}
        <button type="submit" className="btn btn--primary" disabled={busy || cool.left > 0} aria-busy={busy || undefined}>
          {busy ? c.signin.busy : cool.left > 0 ? c.signin.resendIn(String(cool.left)) : c.signin.resetSend}
        </button>
        <button type="button" className="btn btn--text" onClick={onBack}>
          {c.signin.back}
        </button>
      </form>
    </section>
  );
}

/** Shown after a reset link signed this browser in: choose the new password first. */
export function NewPassword() {
  const { c } = usePrefs();
  const session = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const p = useProblem();
  const titleId = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || password.length < PASSWORD_MIN) return;
    setBusy(true);
    p.clear();
    try {
      await setNewPassword(password);
      setPassword('');
      setDone(true);
    } catch (err) {
      p.set(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel signin__panel" aria-labelledby={titleId} data-testid="new-password">
      <h2 id={titleId} className="signin__lead">
        {c.signin.newPwTitle}
      </h2>
      {done ? (
        <>
          <OkNote text={c.signin.newPwDone} />
          <button type="button" className="btn btn--primary" onClick={() => session.endRecovery?.()}>
            {c.signin.newPwNext}
          </button>
        </>
      ) : (
        <form className="form" onSubmit={(e) => void submit(e)}>
          <p className="muted">{c.signin.newPwBody}</p>
          <PasswordField
            value={password}
            onChange={setPassword}
            label={c.signin.passwordNew}
            autoComplete="new-password"
            hint={c.signin.passwordHint}
          />
          {p.text && <ErrorNote text={p.text} />}
          <button type="submit" className="btn btn--primary" disabled={busy || password.length < PASSWORD_MIN} aria-busy={busy || undefined}>
            {busy ? c.signin.busy : c.signin.newPwSave}
          </button>
          <button type="button" className="btn btn--text" onClick={() => session.endRecovery?.()}>
            {c.signin.newPwLater}
          </button>
        </form>
      )}
    </section>
  );
}
