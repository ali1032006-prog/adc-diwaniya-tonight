import { useEffect, useState } from 'react';
import {
  UserCircle,
  DownloadSimple,
  SignOut,
  BellRinging,
  ShieldCheck,
  Trash,
  CaretLeft,
  CaretRight,
  UserGear,
  SlidersHorizontal,
  IdentificationCard,
  LockKey,
  Database,
  MoonStars,
} from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { ProfileSetup } from '../components/account';
import { AreaMultiSelect, AreaSelect } from '../components/AreaSelect';
import { SectionIndex, jumpTo } from '../components/SectionIndex';
import { Chips, ErrorNote, Field, OkNote } from '../components/ui';
import { usePrefs, type Theme } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import { areaLabel } from '../lib/areas';
import {
  GAMES,
  acceptCohost,
  amIAdmin,
  declineCohost,
  deleteMyAccount,
  exportMyData,
  listBlocked,
  myCohostInvites,
  unblock,
  updatePrivate,
  updateProfile,
  type Game,
} from '../lib/api';
import { pushState, type PushState } from '../lib/push';
import type { Lang, Numerals } from '../lib/i18n';
import { href, hrefFor } from '../lib/router';

/** Me sections in page order (Ali, ADC-LOG-754 item 2): preferences first, the danger zone last. */
export const ME_SECTIONS = ['me-prefs', 'me-account', 'me-pings', 'me-privacy', 'me-data', 'me-delete'] as const;

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

const prefsDir = () => (typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr');

// The account's saved display preferences are applied once per signed-in person on this device.
let appliedFor: string | null = null;

/**
 * S14 Me: preferences on top (one tap from the tab bar), then account and profile, pings and quiet
 * hours, privacy, my data, and the danger zone last; a jump row reaches each section in one tap.
 */
export function Me() {
  const { t, c } = usePrefs();
  const session = useSession();
  const ready = session.status === 'ready';
  return (
    <Screen title={t.me.title}>
      <QuickPrefs />
      {ready && (
        <SectionIndex
          label={c.sections.jump}
          items={[
            { id: 'me-account', label: c.sections.account },
            { id: 'me-pings', label: c.sections.pings },
            { id: 'me-privacy', label: c.me.privacy },
            { id: 'me-data', label: c.me.data },
          ]}
        />
      )}
      {ready ? (
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
    </Screen>
  );
}

/** Language, numerals, theme and the way to pings and quiet hours, at the very top of Me. */
function QuickPrefs() {
  const { t, c, prefs, setPrefs, fmt } = usePrefs();
  const session = useSession();
  const ready = session.status === 'ready';
  const Caret = prefsDir() === 'rtl' ? CaretLeft : CaretRight;
  const setPref = (p: Partial<{ lang: Lang; numerals: Numerals; theme: Theme }>) => {
    setPrefs(p);
    // Signed in, display preferences follow the account so they travel between devices.
    if (ready) void updatePrivate(p).catch(() => {});
  };
  return (
    <section className="panel quick-prefs" id="me-prefs" aria-labelledby="me-prefs-t">
      <h2 id="me-prefs-t" className="panel__title">
        <SlidersHorizontal size={20} aria-hidden="true" /> {t.me.preferences}
      </h2>
      <div className="quick-prefs__grid">
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
      </div>
      <p className="setting__preview" aria-live="polite">
        {t.seatsOpen(3, fmt)}
      </p>
      {ready && (
        <button type="button" className="link-row" onClick={() => jumpTo('me-pings')}>
          <span className="link-row__main">
            <MoonStars size={20} aria-hidden="true" />
            <span>
              {c.sections.pings}
              <span className="muted small link-row__sub">{c.sections.pingsSub}</span>
            </span>
          </span>
          <Caret size={18} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

function AccountPanels() {
  const { t, c, fmt, date, err, setPrefs, prefs } = usePrefs();
  const s = useSession();
  const profile = s.profile!;
  const priv = s.priv!;
  const act = useAction();
  const [saved, setSaved] = useState<{ where: string; text: string } | null>(null);
  const [name, setName] = useState(profile.display_name);
  const [area, setArea] = useState(profile.area);
  const [games, setGames] = useState<Game[]>(profile.games);
  const [pingGames, setPingGames] = useState<Game[]>(priv.ping_games);
  const [pingAreas, setPingAreas] = useState<string[]>(priv.ping_areas);
  const [quietStart, setQuietStart] = useState(priv.quiet_start?.slice(0, 5) ?? '');
  const [quietEnd, setQuietEnd] = useState(priv.quiet_end?.slice(0, 5) ?? '');
  const [cap, setCap] = useState(priv.ping_daily_cap);
  const blocked = useAsync(listBlocked, []);
  const admin = useAsync(amIAdmin, []);
  const [device, setDevice] = useState<PushState | null>(null);
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => {
    let live = true;
    void pushState().then((p) => live && setDevice(p)).catch(() => live && setDevice('unsupported'));
    return () => {
      live = false;
    };
  }, []);
  const Caret = prefsDir() === 'rtl' ? CaretLeft : CaretRight;

  useEffect(() => {
    if (appliedFor === profile.id) return;
    appliedFor = profile.id;
    setPrefs({ lang: priv.lang, numerals: priv.numerals, theme: priv.theme });
  }, [profile.id, priv.lang, priv.numerals, priv.theme, setPrefs]);

  const save = (where: string, fn: () => Promise<unknown>) =>
    void act.run(async () => {
      setSaved(null);
      await fn();
      await s.refresh();
      setSaved({ where, text: c.common.saved });
    });
  const done = (where: string) => (saved?.where === where ? <OkNote text={saved.text} /> : null);

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
      <CohostInvites />

      <form
        className="panel"
        id="me-account"
        aria-labelledby="me-account-t"
        onSubmit={(e) => {
          e.preventDefault();
          save('profile', () => updateProfile({ display_name: name.trim(), area, games }));
        }}
      >
        <h2 id="me-account-t" className="panel__title">
          <IdentificationCard size={20} aria-hidden="true" /> {c.sections.account}
        </h2>
        <div className="account">
          <UserCircle size={48} weight="fill" aria-hidden="true" className="account__avatar" />
          <div>
            <p className="account__name">
              <bdi>{profile.display_name}</bdi>
            </p>
            <p className="account__body">
              <bdi>{areaLabel(profile.area, prefs.lang)}</bdi>
            </p>
          </div>
        </div>
        <dl className="info">
          {row(c.me.signIn, s.provider === 'google' ? 'Google' : (s.provider ?? '—'))}
          {row(c.me.email, s.email ?? '—')}
          {row(c.me.birth, date(`${priv.birth_date}T12:00:00+03:00`))}
          {row(c.me.memberSince, date(profile.created_at))}
          {row(c.me.termsAccepted, date(priv.terms_accepted_at))}
        </dl>
        <h3 className="setting__label">{c.me.profile}</h3>
        <Field label={c.profile.name}>
          <input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={c.profile.area} hint={c.profile.areaHint}>
          <AreaSelect required value={area} onChange={setArea} />
        </Field>
        <div className="field">
          <span className="field__label">{c.me.games}</span>
          <Chips<Game> legend={c.me.games} multi value={games} options={gameOpts} onChange={setGames} />
        </div>
        {done('profile')}
        <button className="btn btn--primary" disabled={act.busy}>
          {c.common.save}
        </button>
      </form>

      <form
        className="panel"
        id="me-pings"
        aria-labelledby="me-pings-t"
        onSubmit={(e) => {
          e.preventDefault();
          save('pings', () =>
            updatePrivate({
              ping_games: pingGames,
              ping_areas: pingAreas.slice(0, 10),
              quiet_start: quietStart || null,
              quiet_end: quietEnd || null,
              ping_daily_cap: cap,
            }),
          );
        }}
      >
        <h2 id="me-pings-t" className="panel__title">
          <BellRinging size={20} aria-hidden="true" /> {c.sections.pings}
        </h2>
        <a className="link-row" href={hrefFor('pings')}>
          <span className="link-row__main">
            <BellRinging size={20} weight={device === 'on' ? 'fill' : 'regular'} aria-hidden="true" />
            <span>
              {c.me.devicePings}
              <span className="muted small link-row__sub">
                {device === 'on' ? c.pings.stateOn : device === 'needs-install' ? c.pings.stateInstall : device === 'denied' ? c.pings.stateDenied : device === 'unsupported' ? c.pings.stateUnsupported : c.pings.stateOff}
              </span>
            </span>
          </span>
          <Caret size={18} aria-hidden="true" />
        </a>
        <div className="field">
          <span className="field__label">{c.me.pingGames}</span>
          <Chips<Game> legend={c.me.pingGames} multi value={pingGames} options={gameOpts} onChange={setPingGames} />
        </div>
        <div className="field">
          <span className="field__label">{c.me.pingAreas}</span>
          <AreaMultiSelect label={c.me.pingAreas} value={pingAreas} onChange={setPingAreas} />
        </div>
        <h3 className="setting__label">{c.sections.quiet}</h3>
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
        {done('pings')}
        <button className="btn btn--primary" disabled={act.busy}>
          {c.common.save}
        </button>
      </form>

      <section className="panel" id="me-privacy" aria-labelledby="me-privacy-t">
        <h2 id="me-privacy-t" className="panel__title">
          <LockKey size={20} aria-hidden="true" /> {c.me.privacy}
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
        <a className="btn btn--text" href={hrefFor('terms')}>
          {c.signin.readTerms}
        </a>
      </section>

      <section className="panel" id="me-data" aria-labelledby="me-data-t">
        <h2 id="me-data-t" className="panel__title">
          <Database size={20} aria-hidden="true" /> {c.me.data}
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
        {admin.data && (
          <a className="link-row" href={hrefFor('admin')}>
            <span className="link-row__main">
              <ShieldCheck size={20} aria-hidden="true" />
              <span>{c.admin.entry}</span>
            </span>
            <Caret size={18} aria-hidden="true" />
          </a>
        )}
      </section>

      <button type="button" className="btn btn--quiet" onClick={() => void s.signOut()}>
        <SignOut size={18} aria-hidden="true" />
        {c.me.signOut}
      </button>

      <form
        className="panel danger-zone"
        id="me-delete"
        aria-labelledby="me-delete-t"
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmText.trim() !== c.me.deleteWord) return;
          void act.run(async () => {
            await deleteMyAccount();
            await s.signOut();
          });
        }}
      >
        <h2 id="me-delete-t" className="panel__title">
          {c.me.deleteTitle}
        </h2>
        <p className="muted">{c.me.deleteBody}</p>
        <Field label={c.me.deleteType(c.me.deleteWord)}>
          <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </Field>
        <button className="btn btn--danger" disabled={act.busy || confirmText.trim() !== c.me.deleteWord}>
          <Trash size={18} aria-hidden="true" />
          {c.me.deleteButton}
        </button>
      </form>
    </>
  );
}

/** Co-host invites wait here until the person accepts or declines (ADC-SEC-18). Hidden when there are none. */
function CohostInvites() {
  const { c, date, err, prefs } = usePrefs();
  const s = useSession();
  const invites = useAsync(myCohostInvites, [], ['inbox']);
  const act = useAction();
  const list = invites.data ?? [];
  if (list.length === 0) return null;
  const answer = (fn: () => Promise<unknown>) =>
    void act.run(async () => {
      await fn();
      invites.reload();
      await s.refresh();
    });
  return (
    <section className="panel" aria-labelledby="me-invites">
      <h2 id="me-invites" className="panel__title">
        <UserGear size={18} aria-hidden="true" /> {c.me.invitesTitle}
      </h2>
      <p className="muted">{c.me.invitesBody}</p>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      <ul className="people">
        {list.map((i) => (
          <li key={i.diwaniya_id} className="people__row invite">
            <span className="invite__what">
              <bdi>{i.diwaniya?.name ?? '؟'}</bdi>
              {i.diwaniya?.area && (
                <span className="muted small">
                  {' · '}
                  <bdi>{areaLabel(i.diwaniya.area, prefs.lang)}</bdi>
                </span>
              )}
              <span className="muted small"> · {date(i.invited_at)}</span>
            </span>
            <span className="row invite__actions">
              <button type="button" className="btn btn--primary btn--small" disabled={act.busy} onClick={() => answer(() => acceptCohost(i.diwaniya_id))}>
                {c.me.accept}
              </button>
              <button type="button" className="btn btn--quiet btn--small" disabled={act.busy} onClick={() => answer(() => declineCohost(i.diwaniya_id))}>
                {c.me.decline}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
