import { useEffect, useState } from 'react';
import { usePrefs } from '../lib/prefs';

/**
 * The Diwaniyatna mark (own drawing, ASSET-LICENSES.md): a round table with six seats, the one
 * still open drawn as a dashed saffron ring, the same motif as the app icon. Each seat is its own
 * group so the launch can bring them in one after another (transform and opacity only).
 */
export function LogoMark({ size = 112, animated = false }: { size?: number; animated?: boolean }) {
  const seats = [
    [50, 15],
    [80.3, 32.5],
    [80.3, 67.5],
    [50, 85],
    [19.7, 67.5],
    [19.7, 32.5],
  ];
  return (
    <svg className={animated ? 'logo-mark logo-mark--animated' : 'logo-mark'} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="logo-mark__table" cx="50" cy="50" r="19" />
      {seats.map(([x, y], i) => (
        <g key={i} className="logo-mark__seat" style={{ ['--i' as string]: i, transformOrigin: `${x}px ${y}px` }}>
          <circle cx={x} cy={y} r="8.5" className={i === 3 ? 'logo-mark__open' : 'logo-mark__taken'} />
        </g>
      ))}
    </svg>
  );
}

export const SPLASHED = 'dt.splashed.v1';
/** Total launch time in ms; the CSS keyframes add up to the same (Ali: under about 1.5 s). */
export const SPLASH_MS = 1300;
export const SPLASH_REDUCED_MS = 450;

/**
 * Launch (ADC-LOG-764 item 5): a short logo animation on the first load of a visit, then the app
 * (signed out, that is the sign-in page). Under prefers-reduced-motion it is a plain fade. Once per
 * tab session, so moving around or reloading mid-visit never replays it.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const { t } = usePrefs();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduced ? SPLASH_REDUCED_MS : SPLASH_MS;
    const out = setTimeout(() => setLeaving(true), total - 250);
    const done = setTimeout(onDone, total);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [onDone]);
  return (
    <div className={leaving ? 'splash splash--out' : 'splash'} role="img" aria-label={t.appName}>
      <LogoMark size={128} animated />
      <p className="splash__word" aria-hidden="true">
        {t.appName}
      </p>
    </div>
  );
}
