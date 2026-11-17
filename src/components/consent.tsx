import { useId } from 'react';
import { Warning } from '@phosphor-icons/react';
import { usePrefs } from '../lib/prefs';
import { ageOn, isAdult, maxBirthDate } from '../lib/auth';
import { hrefFor } from '../lib/router';

/** Date of birth for the 18+ gate (ruling B). The hint turns into the reason once a date is in. */
export function BirthField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { c } = usePrefs();
  const hintId = useId();
  const age = value ? ageOn(value) : null;
  const problem = !value ? null : age === null || age >= 130 ? c.profile.badDate : !isAdult(value) ? c.profile.tooYoung : null;
  return (
    <label className="field">
      <span className="field__label">{c.profile.birth}</span>
      <input
        className="input input--date"
        type="date"
        required
        min="1900-01-01"
        max={maxBirthDate()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={hintId}
        autoComplete="bday"
      />
      <span id={hintId} className={problem ? 'field__hint field__hint--error' : 'field__hint'} aria-live="polite">
        {problem && <Warning size={16} weight="fill" aria-hidden="true" />}
        {problem ?? c.profile.tooYoung}
      </span>
    </label>
  );
}

/**
 * The two consents every account gives (ruling C and the Terms). The Terms link opens in a new tab
 * so nothing typed here is lost.
 */
export function ConsentChecks({ male, terms, onMale, onTerms }: {
  male: boolean;
  terms: boolean;
  onMale: (v: boolean) => void;
  onTerms: (v: boolean) => void;
}) {
  const { c } = usePrefs();
  return (
    <div className="consent">
      <label className="check">
        <input type="checkbox" required checked={male} onChange={(e) => onMale(e.target.checked)} />
        <span>{c.profile.male}</span>
      </label>
      <label className="check">
        <input type="checkbox" required checked={terms} onChange={(e) => onTerms(e.target.checked)} />
        <span>
          {c.profile.termsBefore}
          <a href={hrefFor('terms')} target="_blank" rel="noopener">
            {c.profile.termsLink}
          </a>
          {c.profile.termsAfter}
        </span>
      </label>
    </div>
  );
}
