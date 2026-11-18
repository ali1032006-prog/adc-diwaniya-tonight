import { Globe } from '@phosphor-icons/react';
import { usePrefs } from '../lib/prefs';

/**
 * Arabic / English before signing in (Ali's change list 5 item 3, ADC-LOG-806): on the sign-in
 * screen, the Terms and the Welcome steps. The choice is saved on this device (dt.prefs.v1) and,
 * after sign-in, PrefsSync copies the device's choice to the account (never the other way round,
 * ADC-LOG-797), so it never flips back. The visible label is the language you switch TO, written
 * in that language, so someone who can't read the current one still finds it (and the accessible
 * name is that same visible word, read with the right voice through lang).
 */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { prefs, setPrefs, t } = usePrefs();
  const to = prefs.lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      className={`btn btn--quiet btn--small lang-switch ${className}`.trim()}
      onClick={() => setPrefs({ lang: to })}
    >
      <Globe size={18} aria-hidden="true" />
      <span lang={to}>{t.welcome.language}</span>
    </button>
  );
}
