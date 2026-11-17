import { useEffect, useState } from 'react';
import { UserCircle, DownloadSimple, SignOut } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { ProfileSetup } from '../components/account';
import { Chips, ErrorNote, Field, OkNote } from '../components/ui';
import { usePrefs, type Theme } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import { GAMES, exportMyData, listBlocked, unblock, updatePrivate, updateProfile, type Game } from '../lib/api';
import type { Lang, Numerals } from '../lib/i18n';
import { href, hrefFor } from '../lib/router';

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

// The account's saved display preferences are applied once per signed-in person on this device.
let appliedFor: string | null = null;

/** S14 Me: account info, profile, pings, privacy, my data and preferences in one detailed settings page. */
export function Me() {
  const { t, c, prefs, setPrefs, fmt } = usePrefs();
  const session = useSession();
  const setPref = (p: Partial<{ lang: Lang; numerals: Numerals; theme: Theme }>) => {
    setPrefs(p);
    // Signed in, display preferences follow the account so they travel between devices.
    if (session.status === 'ready') void updatePrivate(p).catch(() => {});
  };
  return (
    <Screen title={t.me.title}>
      {session.status === 'ready' ? (
        <AccountPanels />
      ) : session.status === 'needsProfile' ? (
        <ProfileSetup />
      ) : (
        <section className="panel" aria-labelledby="me-account">
          <h2 id="me-account" className="panel__title">
            {t.me.account}
          </h2>
          <div className="account">
            <UserCircle size={48} weight="regular" aria-hidden="true" className="account__avatar" />
            <div>
              <p className="account__name">{t.me.guest}</p>
              <p className="account__body">{t.me.guestBody}</p>
            </div>
          </div>
          <div className="actions-row">
            <a className="btn btn--primary" href={href.signin('signin', 'me')}>
              {c.gate.signIn}
            </a>
            <a className="btn btn--quiet" href={href.signin('register', 'me')}>
              {c.gate.register}
            </a>
          </div>
          <a className="btn btn--text" href={hrefFor('terms')}>
            {c.signin.readTerms}
          </a>
        </section>
      )}
      <section className="panel" aria-labelledby="me-prefs">
        <h2 id="me-prefs" className="panel__title">
          {t.me.preferences}
        </h2>
        <Segmented<Lang>
          name="lang"
          legend={t.me.language}
          value={prefs.lang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(lang) => setPref({ lang })}
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
          onChange={(numerals) => setPref({ numerals })}
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
          onChange={(theme) => setPref({ theme })}
        />
        <p className="setting__preview" aria-live="polite">
          {t.seatsOpen(3, fmt)}
        </p>
      </section>
      {session.status === 'ready' && (
        <button type="button" className="btn btn--quiet" onClick={() => void session.signOut()}>
          <SignOut size={18} aria-hidden="true" />
          {c.me.signOut}
        </button>
      )}
    </Screen>
  );
}

function AccountPanels() {
  const { t, c, fmt, date, err, setPrefs } = usePrefs();
  const s = useSession();
  const profile = s.profile!;
  const priv = s.priv!;
  const act = useAction();
  const [saved, setSaved] = useState('');
  const [name, setName] = useState(profile.display_name);
  const [area, setArea] = useState(profile.area);
  const [games, setGames] = useState<Game[]>(profile.games);
  const [pingGames, setPingGames] = useState<Game[]>(priv.ping_games);
  const [pingAreas, setPingAreas] = useState(priv.ping_areas.join('، '));
  const [quietStart, setQuietStart] = useState(priv.quiet_start?.slice(0, 5) ?? '');
  const [quietEnd, setQuietEnd] = useState(priv.quiet_end?.slice(0, 5) ?? '');
  const [cap, setCap] = useState(priv.ping_daily_cap);
  const blocked = useAsync(listBlocked, []);

  useEffect(() => {
    if (appliedFor === profile.id) return;
    appliedFor = profile.id;
    setPrefs({ lang: priv.lang, numerals: priv.numerals, theme: priv.theme });
  }, [profile.id, priv.lang, priv.numerals, priv.theme, setPrefs]);

  const save = (fn: () => Promise<unknown>) =>
    void act.run(async () => {
      await fn();
      await s.refresh();
      setSaved(c.common.saved);
    });

  const gameOpts = GAMES.map((g) => ({ value: g, label: t.games[g] }));
  const row = (label: string, value: string) => (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );

  return (
    <>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {saved && <OkNote text={saved} />}
      <section className="panel" aria-labelledby="me-account">
        <h2 id="me-account" className="panel__title">
          {t.me.account}
        </h2>
        <div className="account">
          <UserCircle size={48} weight="fill" aria-hidden="true" className="account__avatar" />
          <div>
            <p className="account__name">
              <bdi>{profile.display_name}</bdi>
            </p>
            <p className="account__body">
              <bdi>{profile.area}</bdi>
            </p>
          </div>
        </div>
        <dl className="info">
          {row(c.me.signIn, s.provider === 'google' ? 'Google' : (s.provider ?? '—'))}
          {row(c.me.email, s.email ?? '—')}
          {row(c.me.birth, date(`${priv.birth_date}T12:00:00+03:00`))}
          {row(c.me.memberSince, date(profile.created_at))}
          {row(c.me.termsAccepted, date(priv.terms_accepted_at))}
          {row(c.me.maleConfirmed, date(priv.male_confirmed_at))}
        </dl>
      </section>

      <form
        className="panel"
        aria-labelledby="me-profile"
        onSubmit={(e) => {
          e.preventDefault();
          save(() => updateProfile({ display_name: name.trim(), area: area.trim(), games }));
        }}
      >
        <h2 id="me-profile" className="panel__title">
          {c.me.profile}
        </h2>
        <Field label={c.profile.name}>
          <input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={c.profile.area} hint={c.profile.areaHint}>
          <input className="input" required maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <div className="field">
          <span className="field__label">{c.me.games}</span>
          <Chips<Game> legend={c.me.games} multi value={games} options={gameOpts} onChange={setGames} />
        </div>
        <button className="btn btn--primary" disabled={act.busy}>
          {c.common.save}
        </button>
      </form>

      <form
        className="panel"
        aria-labelledby="me-pings"
        onSubmit={(e) => {
          e.preventDefault();
          save(() =>
            updatePrivate({
              ping_games: pingGames,
              ping_areas: pingAreas
                .split(/[,،]/)
                .map((a) => a.trim())
                .filter(Boolean)
                .slice(0, 10),
              quiet_start: quietStart || null,
              quiet_end: quietEnd || null,
              ping_daily_cap: cap,
            }),
          );
        }}
      >
        <h2 id="me-pings" className="panel__title">
          {c.me.pings}
        </h2>
        <div className="field">
          <span className="field__label">{c.me.pingGames}</span>
          <Chips<Game> legend={c.me.pingGames} multi value={pingGames} options={gameOpts} onChange={setPingGames} />
        </div>
        <Field label={c.me.pingAreas}>
          <input className="input" maxLength={300} value={pingAreas} onChange={(e) => setPingAreas(e.target.value)} />
        </Field>
        <div className="form--grid">
          <Field label={c.me.quietStart}>
            <input className="input input--time" type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
          </Field>
          <Field label={c.me.quietEnd}>
            <input className="input input--time" type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
          </Field>
        </div>
        <Field label={c.me.dailyCap}>
          <select className="input" value={cap} onChange={(e) => setCap(Number(e.target.value))}>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {fmt(n)}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn btn--primary" disabled={act.busy}>
          {c.common.save}
        </button>
      </form>

      <section className="panel" aria-labelledby="me-privacy">
        <h2 id="me-privacy" className="panel__title">
          {c.me.privacy}
        </h2>
        <h3 className="setting__label">{c.me.blocked}</h3>
        {blocked.data && blocked.data.length === 0 && <p className="muted">{c.me.noBlocked}</p>}
        <ul className="people">
          {(blocked.data ?? []).map((b) => (
            <li key={b.blocked_id}>
              <bdi>{b.profile?.display_name ?? '؟'}</bdi>
              <button
                type="button"
                className="btn btn--text btn--small"
                disabled={act.busy}
                onClick={() =>
                  void act.run(async () => {
                    await unblock(b.blocked_id);
                    blocked.reload();
                  })
                }
              >
                {c.me.unblock}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="me-data">
        <h2 id="me-data" className="panel__title">
          {c.me.data}
        </h2>
        <button
          type="button"
          className="btn btn--quiet"
          disabled={act.busy}
          onClick={() =>
            void act.run(async () => {
              const blob = new Blob([JSON.stringify(await exportMyData(), null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'diwaniya-tonight-my-data.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            })
          }
        >
          <DownloadSimple size={18} aria-hidden="true" />
          {c.me.download}
        </button>
        <p className="muted small">{c.me.deleteNote}</p>
      </section>
    </>
  );
}
