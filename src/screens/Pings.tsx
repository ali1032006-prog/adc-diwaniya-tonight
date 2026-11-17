import { useEffect, useState } from 'react';
import { BellRinging, BellSlash, DeviceMobile, Export, PlusSquare, ArrowSquareOut, HandTap } from '@phosphor-icons/react';
import { PushBar, ErrorNote, OkNote } from '../components/ui';
import { SeatRing } from '../components/SeatRing';
import { NeedsAccount } from '../components/account';
import { usePrefs } from '../lib/prefs';
import { useAction, useAsync } from '../lib/useAsync';
import { isIOS, isStandalone, pushState, turnOffPings, turnOnPings, type PushState } from '../lib/push';
import { pushDeviceCount } from '../lib/api';
import { hrefFor } from '../lib/router';

const IOS_ICONS = [Export, PlusSquare, ArrowSquareOut, HandTap];

/** S4 Install and pings guide: shown after profile setup and from Me (ADC-RES-50 nav map). */
export function Pings() {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.pings.title} parent={hrefFor('me')} />
      <div className="screen__body">
        <NeedsAccount>
          <PingsBody />
        </NeedsAccount>
      </div>
    </>
  );
}

function PingsBody() {
  const { c, fmt, err } = usePrefs();
  const [state, setState] = useState<PushState | null>(null);
  const devices = useAsync(pushDeviceCount, [state]);
  const act = useAction();
  const [rang, setRang] = useState(false); // the bell rings once when pings come on, never on load
  useEffect(() => {
    let live = true;
    void pushState().then((s) => live && setState(s)).catch(() => live && setState('unsupported'));
    return () => {
      live = false;
    };
  }, []);
  const ios = isIOS() && !isStandalone();
  const line: Record<PushState, string> = {
    on: c.pings.stateOn,
    off: c.pings.stateOff,
    denied: c.pings.stateDenied,
    unsupported: c.pings.stateUnsupported,
    'needs-install': c.pings.stateInstall,
  };

  return (
    <div className="stack pings">
      <section className="pings__hero" aria-labelledby="pings-lead">
        <SeatRing game="kout" seats={[{ initials: 'ع' }, { initials: 'م' }, { initials: 'ف' }, null, { initials: 'س' }, { initials: 'ب' }]} size={112} decorative />
        <p id="pings-lead" className="pings__lead">
          {c.pings.lead}
        </p>
      </section>

      <section className="panel" aria-labelledby="pings-state">
        <h2 id="pings-state" className="panel__title">
          {c.me.devicePings}
        </h2>
        <p className={`pings__state pings__state--${state ?? 'off'}`} aria-live="polite">
          {state === 'on' ? (
            <BellRinging size={22} weight="fill" aria-hidden="true" className={rang ? 'bell bell--ring' : 'bell'} />
          ) : (
            <BellSlash size={22} aria-hidden="true" />
          )}
          <span>{state ? line[state] : c.common.loading}</span>
        </p>
        {devices.data != null && <p className="muted small">{c.pings.devices(devices.data, fmt)}</p>}
        {act.error != null && <ErrorNote text={err(act.error)} />}
        {state === 'on' && <OkNote text={c.pings.inboxNote} />}
        <div className="actions-row pings__actions">
          {(state === 'off' || state === 'denied') && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={act.busy || state === 'denied'}
              onClick={() =>
                void act.run(async () => {
                  const next = await turnOnPings();
                  setRang(next === 'on');
                  setState(next);
                })
              }
            >
              <BellRinging size={18} aria-hidden="true" />
              {c.pings.turnOn}
            </button>
          )}
          {state === 'on' && (
            <button type="button" className="btn btn--quiet" disabled={act.busy} onClick={() => void act.run(async () => setState(await turnOffPings()))}>
              <BellSlash size={18} aria-hidden="true" />
              {c.pings.turnOff}
            </button>
          )}
          <a className="btn btn--text" href={hrefFor('me')}>
            {c.pings.settings}
          </a>
        </div>
      </section>

      {(ios || state === 'needs-install') && (
        <section className="panel" aria-labelledby="pings-ios">
          <h2 id="pings-ios" className="panel__title">
            <DeviceMobile size={20} aria-hidden="true" /> {c.pings.iosTitle}
          </h2>
          <ol className="steps">
            {c.pings.iosSteps.map((step, i) => {
              const Glyph = IOS_ICONS[i];
              return (
                <li key={step} className="steps__item">
                  <span className="steps__num" aria-hidden="true">
                    {fmt(i + 1)}
                  </span>
                  <Glyph size={22} aria-hidden="true" className="steps__icon" />
                  <span>{step}</span>
                </li>
              );
            })}
          </ol>
          <p className="muted small">{c.pings.iosNote}</p>
        </section>
      )}

      <section className="panel" aria-labelledby="pings-what">
        <h2 id="pings-what" className="panel__title">
          {c.pings.whatTitle}
        </h2>
        <ul className="ticks">
          {c.pings.what.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p className="muted small">{c.pings.inboxNote}</p>
      </section>

      <a className="btn btn--quiet btn--wide" href={hrefFor('tonight')}>
        {c.pings.toTonight}
      </a>
    </div>
  );
}
