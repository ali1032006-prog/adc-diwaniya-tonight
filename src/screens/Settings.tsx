import { useEffect, useState } from 'react';
import { Star, UserGear, House, Article, DoorOpen, MapPin, UsersThree } from '@phosphor-icons/react';
import { PushBar, ErrorNote, Field, OkNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { AreaSelect } from '../components/AreaSelect';
import { MapPicker, type LatLng } from '../components/Map';
import { SectionIndex } from '../components/SectionIndex';
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
import { href, hrefFor } from '../lib/router';

/** The S9 sections, in page order (Ali, ADC-LOG-754 item 2: 'looks like a mess'). */
export const SETTINGS_SECTIONS = ['basics', 'page', 'joining', 'location', 'people'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** S9 Diwaniya settings: five labelled sections, each with its own save, and a jump row at the top. */
export function Settings({ id }: { id: string }) {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.settings.title} parent={hrefFor('diwaniya')} />
      <div className="screen__body">
        <NeedsAccount>
          <SettingsBody id={id} />
        </NeedsAccount>
      </div>
    </>
  );
}

function SettingsBody({ id }: { id: string }) {
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
      <SectionIndex
        label={S.jump}
        items={[
          { id: 's9-basics', label: S.basics },
          { id: 's9-page', label: S.page },
          { id: 's9-joining', label: c.settings.joining },
          { id: 's9-location', label: c.settings.location },
          { id: 's9-people', label: S.people },
        ]}
      />
      {act.error != null && <ErrorNote text={err(act.error)} />}

      <form
        className="panel settings__section"
        id="s9-basics"
        aria-labelledby="s9-basics-t"
        onSubmit={(e) => {
          e.preventDefault();
          save('basics', () => updateDiwaniya(id, { name: form.name.trim(), area: form.area, usual_slot: form.usual_slot }));
        }}
      >
        <h2 id="s9-basics-t" className="panel__title">
          <House size={20} aria-hidden="true" /> {S.basics}
        </h2>
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

      <form
        className="panel settings__section"
        id="s9-page"
        aria-labelledby="s9-page-t"
        onSubmit={(e) => {
          e.preventDefault();
          save('page', () => updateDiwaniya(id, { about: form.about, rules: form.rules }));
        }}
      >
        <h2 id="s9-page-t" className="panel__title">
          <Article size={20} aria-hidden="true" /> {S.page}
        </h2>
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

      <form
        className="panel settings__section"
        id="s9-joining"
        aria-labelledby="s9-joining-t"
        onSubmit={(e) => {
          e.preventDefault();
          save('joining', () => updateDiwaniya(id, { visibility: form.visibility, approval: form.approval, guest_cap: form.guest_cap }));
        }}
      >
        <h2 id="s9-joining-t" className="panel__title">
          <DoorOpen size={20} aria-hidden="true" /> {c.settings.joining}
        </h2>
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

      <form
        className="panel settings__section"
        id="s9-location"
        aria-labelledby="s9-location-t"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pin) {
            setSaved({ where: 'location', text: '' });
            return;
          }
          save('location', async () => {
            await setPin(id, pin.lat, pin.lng, directions.trim());
            await updateDiwaniya(id, { pin_unlock_minutes: form.pin_unlock_minutes });
          });
        }}
      >
        <h2 id="s9-location-t" className="panel__title">
          <MapPin size={20} aria-hidden="true" /> {c.settings.location}
        </h2>
        <p className="muted small">{c.settings.locationBody}</p>
        {host ? (
          <>
            <MapPicker value={pin} onChange={setPinAt} />
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

      <section className="panel settings__section" id="s9-people" aria-labelledby="s9-people-t">
        <h2 id="s9-people-t" className="panel__title">
          <UsersThree size={20} aria-hidden="true" /> {S.people}
        </h2>
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
    </div>
  );
}
