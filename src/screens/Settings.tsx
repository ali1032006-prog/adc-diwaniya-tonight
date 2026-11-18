import { useEffect, useState } from 'react';
import { Star, UserGear, House, Article, DoorOpen, MapPin, UsersThree } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { PushBar, ErrorNote, Field, OkNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { AreaSelect } from '../components/AreaSelect';
import { MapPicker, type LatLng } from '../components/Map';
import { MenuRow } from '../components/MenuRow';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import {
  getDiwaniya,
  getPin,
  listCohosts,
  listRegulars,
  removeCohost,
  removeRegular,
  setPin,
  updateDiwaniya,
  type DiwaniyaSettings,
} from '../lib/api';
import { SETTINGS_SECTIONS, href, hrefFor, type SettingsSection } from '../lib/router';

const ICONS: Record<SettingsSection, Icon> = { basics: House, page: Article, joining: DoorOpen, location: MapPin, people: UsersThree };

/**
 * S9 Diwaniya settings (Ali, ADC-LOG-764 item 7): a menu of five buttons; each opens its own section
 * page with its own save, and back returns to the menu.
 */
export function Settings({ id, section }: { id: string; section?: SettingsSection }) {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={section ? sectionTitle(section, c) : c.settings.title} parent={section ? href.settings(id) : hrefFor('diwaniya')} />
      <div className="screen__body">
        <NeedsAccount>{section ? <SettingsBody id={id} section={section} /> : <SettingsMenu id={id} />}</NeedsAccount>
      </div>
    </>
  );
}

type C = ReturnType<typeof usePrefs>['c'];
function sectionTitle(s: SettingsSection, c: C): string {
  return { basics: c.sections.basics, page: c.sections.page, joining: c.settings.joining, location: c.settings.location, people: c.sections.people }[s];
}
function sectionSub(s: SettingsSection, c: C): string {
  return { basics: c.menu.basicsSub, page: c.menu.pageSub, joining: c.menu.joiningSub, location: c.menu.locationSub, people: c.menu.peopleSub }[s];
}

function SettingsMenu({ id }: { id: string }) {
  const { c, err } = usePrefs();
  const dw = useAsync(() => getDiwaniya(id), [id]);
  if (dw.loading && !dw.data) return <Skeleton rows={2} />;
  if (dw.error != null && !dw.data) return <ErrorNote text={err(dw.error)} onRetry={dw.reload} />;
  if (!dw.data) return <ErrorNote text={c.errors.notFound} />;
  return (
    <nav aria-label={c.settings.title}>
      <h2 className="place__name settings__name">
        <bdi>{dw.data.name}</bdi>
      </h2>
      <ul className="menu">
        {SETTINGS_SECTIONS.map((x) => (
          <MenuRow key={x} href={href.settings(id, x)} icon={ICONS[x]} title={sectionTitle(x, c)} sub={sectionSub(x, c)} />
        ))}
      </ul>
    </nav>
  );
}

function SettingsBody({ id, section }: { id: string; section: SettingsSection }) {
  const { c, err } = usePrefs();
  const { userId } = useSession();
  const data = useAsync(async () => {
    const [dw, pin, regulars, cohosts] = await Promise.all([getDiwaniya(id), getPin(id), listRegulars(id), listCohosts(id)]);
    return { dw, pin, regulars, cohosts };
  }, [id]);
  const act = useAction();
  const [form, setForm] = useState<DiwaniyaSettings | null>(null);
  const [pin, setPinAt] = useState<LatLng | null>(null);
  const [directions, setDirections] = useState('');
  const [address, setAddress] = useState('');
  const [saved, setSaved] = useState<{ where: SettingsSection; text: string } | null>(null);

  useEffect(() => {
    const d = data.data?.dw;
    if (d) {
      setForm({
        name: d.name,
        area: d.area,
        about: d.about,
        rules: d.rules,
        visibility: d.visibility,
        approval: d.approval,
        guest_cap: d.guest_cap,
        pin_unlock_minutes: d.pin_unlock_minutes,
        usual_slot: d.usual_slot,
      });
    }
    const p = data.data?.pin;
    if (p) {
      setPinAt({ lat: Number(p.lat), lng: Number(p.lng) });
      setDirections(p.directions);
      setAddress(p.address ?? '');
    }
  }, [data.data]);

  if (data.loading && !data.data) return <Skeleton rows={2} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const dw = data.data!.dw;
  if (!dw || !form) return <ErrorNote text={c.errors.notFound} />;
  const host = dw.host_id === userId;
  const set = <K extends keyof DiwaniyaSettings>(k: K, v: DiwaniyaSettings[K]) => setForm({ ...form, [k]: v });
  const save = (where: SettingsSection, fn: () => Promise<unknown>) =>
    void act.run(async () => {
      setSaved(null);
      await fn();
      setSaved({ where, text: c.common.saved });
      data.reload();
    });
  const done = (where: SettingsSection) => (saved?.where === where ? <OkNote text={saved.text} /> : null);
  const S = c.sections;

  return (
    <div className="settings">
      {act.error != null && <ErrorNote text={err(act.error)} />}

      {section === 'basics' && (
      <form
        className="panel settings__section"
        id="s9-basics"
        aria-label={S.basics}
        onSubmit={(e) => {
          e.preventDefault();
          save('basics', () => updateDiwaniya(id, { name: form.name.trim(), area: form.area, usual_slot: form.usual_slot }));
        }}
      >
        <fieldset className="settings__fields" disabled={!host}>
          <Field label={c.board.name}>
            <input className="input" required maxLength={60} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={c.profile.area}>
            <AreaSelect required value={form.area} onChange={(v) => set('area', v)} />
          </Field>
          <Field label={c.settings.usualSlot} hint={c.settings.usualSlotHint}>
            <input className="input" maxLength={40} value={form.usual_slot} onChange={(e) => set('usual_slot', e.target.value)} />
          </Field>
        </fieldset>
        {done('basics')}
        {host && (
          <button className="btn btn--primary" disabled={act.busy}>
            {c.common.save}
          </button>
        )}
      </form>
      )}

      {section === 'page' && (
      <form
        className="panel settings__section"
        id="s9-page"
        aria-label={S.page}
        onSubmit={(e) => {
          e.preventDefault();
          save('page', () => updateDiwaniya(id, { about: form.about, rules: form.rules }));
        }}
      >
        <fieldset className="settings__fields" disabled={!host}>
          <Field label={c.settings.about}>
            <textarea className="input" rows={3} maxLength={500} value={form.about} onChange={(e) => set('about', e.target.value)} />
          </Field>
          <Field label={c.settings.rules}>
            <textarea className="input" rows={4} maxLength={1000} value={form.rules} onChange={(e) => set('rules', e.target.value)} />
          </Field>
        </fieldset>
        {done('page')}
        {host && (
          <button className="btn btn--primary" disabled={act.busy}>
            {c.common.save}
          </button>
        )}
      </form>
      )}

      {section === 'joining' && (
      <form
        className="panel settings__section"
        id="s9-joining"
        aria-label={c.settings.joining}
        onSubmit={(e) => {
          e.preventDefault();
          save('joining', () => updateDiwaniya(id, { visibility: form.visibility, approval: form.approval, guest_cap: form.guest_cap }));
        }}
      >
        <fieldset className="settings__fields" disabled={!host}>
          <Field label={c.settings.visibility}>
            <select className="input" value={form.visibility} onChange={(e) => set('visibility', e.target.value as DiwaniyaSettings['visibility'])}>
              {(['public', 'followers'] as const).map((v) => (
                <option key={v} value={v}>
                  {c.settings.visibilityOpts[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={c.settings.approval}>
            <select className="input" value={form.approval} onChange={(e) => set('approval', e.target.value as DiwaniyaSettings['approval'])}>
              {(['host', 'regulars_auto'] as const).map((v) => (
                <option key={v} value={v}>
                  {c.settings.approvalOpts[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={c.settings.guestCap}>
            <input className="input input--num" type="number" min={0} max={30} required value={form.guest_cap} onChange={(e) => set('guest_cap', Number(e.target.value))} />
          </Field>
        </fieldset>
        {done('joining')}
        {host && (
          <button className="btn btn--primary" disabled={act.busy}>
            {c.common.save}
          </button>
        )}
      </form>
      )}

      {section === 'location' && (
      <form
        className="panel settings__section"
        id="s9-location"
        aria-label={c.settings.location}
        onSubmit={(e) => {
          e.preventDefault();
          if (!pin) {
            setSaved({ where: 'location', text: '' });
            return;
          }
          save('location', async () => {
            await setPin(id, pin.lat, pin.lng, directions.trim(), address.trim().replace(/[\u0000-\u001f\u007f]/g, ' '));
            await updateDiwaniya(id, { pin_unlock_minutes: form.pin_unlock_minutes });
          });
        }}
      >
        <p className="muted small">{c.settings.locationBody}</p>
        {host ? (
          <>
            <MapPicker value={pin} onChange={setPinAt} />
            <Field label={c.settings.address} hint={c.settings.addressHint}>
              <textarea className="input" rows={2} maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
            </Field>
            <Field label={c.settings.directions}>
              <textarea className="input" rows={2} maxLength={300} value={directions} onChange={(e) => setDirections(e.target.value)} />
            </Field>
            <Field label={c.settings.pinUnlock}>
              <input
                className="input input--num"
                type="number"
                min={0}
                max={720}
                step={15}
                required
                value={form.pin_unlock_minutes}
                onChange={(e) => set('pin_unlock_minutes', Number(e.target.value))}
              />
            </Field>
            {saved?.where === 'location' && !saved.text && <ErrorNote text={c.map.needPin} />}
            {done('location')}
            <button className="btn btn--primary" disabled={act.busy || !pin}>
              {c.settings.saveLocation}
            </button>
          </>
        ) : (
          <p className="muted">{c.map.hostOnly}</p>
        )}
      </form>
      )}

      {section === 'people' && (
      <section className="panel settings__section" id="s9-people" aria-label={S.people}>
        <h3 className="setting__label">
          <Star size={16} aria-hidden="true" /> {c.settings.regulars}
        </h3>
        {data.data!.regulars.length === 0 && <p className="muted">{c.settings.noRegulars}</p>}
        <ul className="people">
          {data.data!.regulars.map((r) => (
            <li key={r.user_id}>
              <a className="link" href={href.player(r.user_id)}>
                <bdi>{r.profile?.display_name ?? '؟'}</bdi>
              </a>
              <button type="button" className="btn btn--text btn--small" disabled={act.busy} onClick={() => save('people', () => removeRegular(id, r.user_id))}>
                {c.common.remove}
              </button>
            </li>
          ))}
        </ul>
        <h3 className="setting__label">
          <UserGear size={16} aria-hidden="true" /> {c.settings.cohosts}
        </h3>
        {data.data!.cohosts.length === 0 && <p className="muted">{c.settings.noCohosts}</p>}
        <ul className="people">
          {data.data!.cohosts.map((r) => (
            <li key={r.user_id}>
              <a className="link" href={href.player(r.user_id)}>
                <bdi>{r.profile?.display_name ?? '؟'}</bdi>
              </a>
              {!r.accepted_at && <span className="tag tag--saffron">{c.settings.invited}</span>}
              {(host || r.user_id === userId) && (
                <button type="button" className="btn btn--text btn--small" disabled={act.busy} onClick={() => save('people', () => removeCohost(id, r.user_id))}>
                  {c.common.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
        {done('people')}
      </section>
      )}
    </div>
  );
}
