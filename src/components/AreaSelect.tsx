import { X } from '@phosphor-icons/react';
import { GOVERNORATES, areaLabel, areaValue } from '../lib/areas';
import { usePrefs } from '../lib/prefs';

/**
 * Area picker (Ali, ADC-LOG-754 item 1): one native dropdown, grouped by governorate, so phones
 * open their own wheel or list. The value is the list's Arabic name; labels follow the language.
 */
export function AreaSelect({
  value,
  onChange,
  required,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  /** For a select that is not inside a <Field> label. */
  label?: string;
}) {
  const { c, prefs } = usePrefs();
  const v = areaValue(value);
  return (
    <select className="input" required={required} value={v} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled={required}>
        {c.areas.pick}
      </option>
      {GOVERNORATES.map((g) => (
        <optgroup key={g.key} label={prefs.lang === 'en' ? g.en : g.ar}>
          {g.areas.map((a) => (
            <option key={a.ar} value={a.ar}>
              {prefs.lang === 'en' ? a.en : a.ar}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Several areas (ping areas): a dropdown to add one, each chosen area a removable chip. Up to `max`. */
export function AreaMultiSelect({ value, onChange, max = 10, label }: { value: string[]; onChange: (v: string[]) => void; max?: number; label: string }) {
  const { c, prefs } = usePrefs();
  const chosen = value.map(areaValue).filter(Boolean);
  return (
    <div className="area-multi">
      {chosen.length > 0 && (
        <ul className="area-multi__list" aria-label={label}>
          {chosen.map((a) => (
            <li key={a} className="area-chip">
              <bdi>{areaLabel(a, prefs.lang)}</bdi>
              <button
                type="button"
                className="area-chip__x"
                aria-label={c.areas.remove(areaLabel(a, prefs.lang))}
                onClick={() => onChange(chosen.filter((x) => x !== a))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length < max ? (
        <select
          className="input"
          aria-label={c.areas.add}
          value=""
          onChange={(e) => {
            const a = e.target.value;
            if (a && !chosen.includes(a)) onChange([...chosen, a]);
          }}
        >
          <option value="">{c.areas.add}</option>
          {GOVERNORATES.map((g) => (
            <optgroup key={g.key} label={prefs.lang === 'en' ? g.en : g.ar}>
              {g.areas
                .filter((a) => !chosen.includes(a.ar))
                .map((a) => (
                  <option key={a.ar} value={a.ar}>
                    {prefs.lang === 'en' ? a.en : a.ar}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      ) : (
        <p className="muted small">{c.areas.full(max)}</p>
      )}
    </div>
  );
}
