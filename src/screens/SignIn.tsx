import { useEffect, useId, useRef, useState } from 'react';
import { EnvelopeSimple, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { PushBar, ErrorNote } from '../components/ui';
import { SeatRing } from '../components/SeatRing';
import { ProfileSetup } from '../components/account';
import { BirthField, ConsentChecks } from '../components/consent';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { hrefFor, WELCOMED } from '../lib/router';
import { isAdult, savePendingRegister, startGoogle, takeReturnError } from '../lib/auth';

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
 * Google is the only way in. Register asks the age (18+), the male confirmation and the Terms
 * first; profile setup after Google asks them again and the server checks them for real.
 */
export function SignIn({ mode, from }: { mode: 'signin' | 'register'; from?: string }) {
  const { c, err } = usePrefs();
  const session = useSession();
  const [tab, setTab] = useState(mode);
  const [birth, setBirth] = useState('');
  const [male, setMale] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returned] = useState(() => takeReturnError());
  const ids = { tabs: useId(), a: useId(), b: useId() };
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setTab(mode), [mode]);

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
      if (register) savePendingRegister({ birth, male, terms });
      localStorage.setItem(WELCOMED, '1');
      await startGoogle(from ? `#/${from}` : '#/tonight');
    } catch (e) {
      setBusy(false);
      setError(err(e));
    }
  };

  const ready = isAdult(birth) && male && terms;
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
      <PushBar title={c.signin.title} parent={hrefFor('me')} />
      <div className="screen__body signin">
        <div className="signin__art" aria-hidden="true">
          <SeatRing
            game="kout"
            seats={[{ initials: 'ب' }, { initials: 'ف' }, { initials: 'س' }, null, { initials: 'ح' }, { initials: 'ج' }]}
            size={124}
            decorative
          />
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

            {returned && <ErrorNote text={c.signin.returnError} />}

            {tab === 'signin' ? (
              <section className="panel signin__panel" role="tabpanel" id={ids.a} aria-labelledby={`${ids.tabs}-signin`} key="a">
                <h2 className="signin__lead">{c.signin.signInLead}</h2>
                <p className="muted">{c.signin.signInBody}</p>
                <GoogleButton label={c.signin.google} busy={busy} busyLabel={c.signin.opening} onClick={() => void go_(false)} />
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
                  <ConsentChecks male={male} terms={terms} onMale={setMale} onTerms={setTerms} />
                  <GoogleButton
                    label={c.signin.googleUp}
                    disabled={!ready}
                    busy={busy}
                    busyLabel={c.signin.opening}
                    onClick={() => void go_(true)}
                  />
                </form>
              </section>
            )}

            {error && <ErrorNote text={error} />}

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
