import { UserCircle } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { usePrefs, type Theme } from '../lib/prefs';
import type { Lang, Numerals } from '../lib/i18n';

function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="setting">
      <legend className="setting__label">{legend}</legend>
      <div className="segmented">
        {options.map((o) => (
          <label key={o.value} className="segmented__opt">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Me() {
  const { t, prefs, setPrefs, fmt } = usePrefs();
  return (
    <Screen title={t.me.title}>
      <section className="panel" aria-labelledby="me-account">
        <h2 id="me-account" className="panel__title">{t.me.account}</h2>
        <div className="account">
          <UserCircle size={48} weight="regular" aria-hidden="true" className="account__avatar" />
          <div>
            <p className="account__name">{t.me.guest}</p>
            <p className="account__body">{t.me.guestBody}</p>
          </div>
        </div>
      </section>
      <section className="panel" aria-labelledby="me-prefs">
        <h2 id="me-prefs" className="panel__title">{t.me.preferences}</h2>
        <Segmented<Lang>
          name="lang"
          legend={t.me.language}
          value={prefs.lang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(lang) => setPrefs({ lang })}
        />
        <Segmented<Numerals>
          name="numerals"
          legend={t.me.numerals}
          value={prefs.numerals}
          options={[
            { value: 'auto', label: t.me.numeralsAuto },
            { value: 'arab', label: '٠١٢٣' },
            { value: 'latn', label: '0123' },
          ]}
          onChange={(numerals) => setPrefs({ numerals })}
        />
        <Segmented<Theme>
          name="theme"
          legend={t.me.theme}
          value={prefs.theme}
          options={[
            { value: 'auto', label: t.me.themeAuto },
            { value: 'night', label: t.me.themeNight },
            { value: 'day', label: t.me.themeDay },
          ]}
          onChange={(theme) => setPrefs({ theme })}
        />
        <p className="setting__preview" aria-live="polite">
          {t.seatsOpen(3, fmt)}
        </p>
      </section>
    </Screen>
  );
}
