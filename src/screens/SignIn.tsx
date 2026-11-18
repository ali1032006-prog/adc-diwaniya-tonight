import { Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
import { EnvelopeSimple, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { PushBar, ErrorNote } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { ProfileSetup } from '../components/account';
import { BirthField, ConsentChecks } from '../components/consent';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { hrefFor } from '../lib/router';
import { LINK_ELSEWHERE, LINK_EXPIRED, isAdult, savePendingRegister, startGoogle, takeReturnError } from '../lib/auth';
import { Divider, EmailRegister, EmailSignIn, ResetRequest } from '../components/EmailAuth';

// Preview builds only (ADC-LOG-775): __PREVIEW_SIGNIN__ is a build-time constant (vite.config.ts).
// In `npm run build` it is the literal false, so this import is compiled away and the test form's
// module is never emitted; scripts/check_prod_bundle.sh proves it on every production build.
const TestSignIn = __PREVIEW_SIGNIN__ ? lazy(() => import('../preview/TestSignIn')) : null;

/** The official "G" (Google's download bundle, see ASSET-LICENSES.md), never redrawn or recoloured. */
export function GoogleButton({ label, disabled, busy, busyLabel, onClick }: {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="gsi-btn" disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
      <img className="gsi-btn__g" src="/brand/google-g.svg" width={20} height={20} alt="" />
      <span className="gsi-btn__text">{busy ? busyLabel : label}</span>
    </button>
  );
}

/**
 * S2 Sign in and Register (ADC-RES-50; Ali's rulings A-C, ADC-LOG-696/697): one screen, two tabs.
 * Google, or an email and a password (Ali's ruling ADC-LOG-802: Supabase's built-in mailer, confirm
 * email ON, password reset). Register asks the age (18+) and the Terms first for both ways (no male
 * checkbox, Ali ADC-LOG-751); profile setup asks them again and the server checks them for real.
 */
export function SignIn({ mode, from }: { mode: 'signin' | 'register'; from?: string }) {
  const { c, t, err } = usePrefs();
  const session = useSession();
  const [tab, setTab] = useState(mode);
  const [birth, setBirth] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returned] = useState(() => takeReturnError());
  const [resetFor, setResetFor] = useState<string | null>(null);
  const ids = { tabs: useId(), a: useId(), b: useId() };
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setTab(mode);
    setResetFor(null);
  }, [mode]);

  if (session.status === 'needsProfile') {
    return (
      <>
        <PushBar title={c.gate.profileTitle} parent={hrefFor('me')} />
        <div className="screen__body">
          <ProfileSetup />
        </div>
      </>
    );
  }

  const go_ = async (register: boolean) => {
    setError(null);
    setBusy(true);
    try {
      if (register) savePendingRegister({ birth, terms });
      await startGoogle(from ? `#/${from}` : '#/tonight');
    } catch (e) {
      setBusy(false);
      setError(err(e));
    }
  };

  const ready = isAdult(birth) && terms;
  const select = (next: 'signin' | 'register', focus = false) => {
    setTab(next);

    if (focus) tabRefs.current[next === 'signin' ? 0 : 1]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      select(tab === 'signin' ? 'register' : 'signin', true);
    }
  };

  return (
    <>
      {session.status === 'signedOut' || session.status === 'offline' ? (
        // The first screen of the app when signed out (ADC-LOG-764 item 5): nothing to go back to.
        <header className="appbar appbar--solo">
          <h1 className="appbar__title">
            <bdi>{t.appName}</bdi>
          </h1>
        </header>
      ) : (
        <PushBar title={c.signin.title} parent={hrefFor('me')} />
      )}
      <div className="screen__body signin">
        <div className="signin__art" aria-hidden="true">
          {/* The launch logo lands here, so the splash hands straight over to sign-in. */}
          <LogoMark size={112} />
        </div>

        {session.status === 'ready' && session.profile ? (
          <section className="panel signin__done" aria-live="polite">
            <p className="signin__lead">
              <bdi>{c.signin.signedIn(session.profile.display_name)}</bdi>
            </p>
            <a className="btn btn--primary" href={hrefFor('me')}>
              {c.signin.toMe}
            </a>
          </section>
        ) : (
          <>
            <div className="signin__tabs" role="tablist" aria-label={c.signin.tabs} id={ids.tabs} data-active={tab}>
              <span className="signin__tab-pill" aria-hidden="true" />
              {(['signin', 'register'] as const).map((k, i) => (
                <button
                  key={k}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${ids.tabs}-${k}`}
                  aria-selected={tab === k}
                  aria-controls={k === 'signin' ? ids.a : ids.b}
                  tabIndex={tab === k ? 0 : -1}
                  className="signin__tab"
                  onClick={() => select(k)}
                  onKeyDown={onKey}
                >
                  {k === 'signin' ? c.signin.tabSignIn : c.signin.tabRegister}
                </button>
              ))}
            </div>

            {returned && (
              <ErrorNote
                text={
                  returned === LINK_ELSEWHERE
                    ? c.signin.linkElsewhere
                    : returned === LINK_EXPIRED
                      ? c.signin.linkExpired
                      : c.signin.returnError
                }
              />
            )}

            {resetFor !== null ? (
              <ResetRequest initialEmail={resetFor} onBack={() => setResetFor(null)} />
            ) : tab === 'signin' ? (
              <section className="panel signin__panel" role="tabpanel" id={ids.a} aria-labelledby={`${ids.tabs}-signin`} key="a">
                <h2 className="signin__lead">{c.signin.signInLead}</h2>
                <p className="muted">{c.signin.signInBody}</p>
                <GoogleButton label={c.signin.google} busy={busy} busyLabel={c.signin.opening} onClick={() => void go_(false)} />
                <Divider />
                <EmailSignIn from={from} onForgot={(email) => setResetFor(email)} />
              </section>
            ) : (
              <section className="panel signin__panel" role="tabpanel" id={ids.b} aria-labelledby={`${ids.tabs}-register`} key="b">
                <h2 className="signin__lead">{c.signin.registerLead}</h2>
                <p className="muted">{c.signin.registerBody}</p>
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (ready) void go_(true);
                  }}
                >
                  <BirthField value={birth} onChange={setBirth} />
                  <ConsentChecks terms={terms} onTerms={setTerms} />
                  <GoogleButton
                    label={c.signin.googleUp}
                    disabled={!ready}
                    busy={busy}
                    busyLabel={c.signin.opening}
                    onClick={() => void go_(true)}
                  />
                </form>
                <Divider />
                <EmailRegister ready={ready} from={from} onBeforeSend={() => savePendingRegister({ birth, terms })} />
              </section>
            )}

            {error && <ErrorNote text={error} />}

            {TestSignIn && tab === 'signin' && resetFor === null && (
              <Suspense fallback={null}>
                <TestSignIn from={from} />
              </Suspense>
            )}

            <section className="signin__how" aria-labelledby="signin-how">
              <h2 id="signin-how" className="signin__how-title">
                {c.signin.howTitle}
              </h2>
              <ul className="signin__how-list">
                {c.signin.how.map((line, i) => {
                  const Icon = [LockKey, EnvelopeSimple, ShieldCheck][i] ?? ShieldCheck;
                  return (
                    <li key={line}>
                      <Icon size={20} aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  );
                })}
              </ul>
              <a className="btn btn--text" href={hrefFor('terms')}>
                {c.signin.readTerms}
              </a>
            </section>
          </>
        )}
      </div>
    </>
  );
}
