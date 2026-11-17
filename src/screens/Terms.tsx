import { PushBar } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { hrefFor } from '../lib/router';

/**
 * Terms and Privacy, Arabic and English (ADC-RES-50 S2). Carries Ali's rulings: men only (C),
 * 18 and over (B), Google sign-in only (A), reports go to the owner (D), pilot data only (F).
 */
export function Terms() {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.terms.title} parent={hrefFor('me')} />
      <article className="screen__body terms">
        <p className="muted small">{c.terms.updated}</p>
        {c.terms.sections.map((s) => (
          <section key={s.h} className="terms__section">
            <h2 className="terms__h">{s.h}</h2>
            <p className="terms__p">{s.p}</p>
          </section>
        ))}
      </article>
    </>
  );
}
