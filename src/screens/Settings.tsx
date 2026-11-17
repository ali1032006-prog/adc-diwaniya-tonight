import { useEffect, useState } from 'react';
import { Star, UserGear } from '@phosphor-icons/react';
import { PushBar, ErrorNote, Field, OkNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
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

/** S9 Diwaniya settings: who sees and joins, the guest cap, the pin, regulars and co-hosts. */
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
  const [pin, setPinForm] = useState({ lat: '', lng: '', directions: '' });
  const [saved, setSaved] = useState('');

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
    if (p) setPinForm({ lat: String(p.lat), lng: String(p.lng), directions: p.directions });
  }, [data.data]);

  if (data.loading && !data.data) return <Skeleton rows={2} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const dw = data.data!.dw;
  if (!dw || !form) return <ErrorNote text={c.errors.notFound} />;
  const host = dw.host_id === userId;
  const set = <K extends keyof DiwaniyaSettings>(k: K, v: DiwaniyaSettings[K]) => setForm({ ...form, [k]: v });
  const save = (fn: () => Promise<unknown>) =>
    void act.run(async () => {
      await fn();
      setSaved(c.common.saved);
      data.reload();
    });

  return (
    <>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {saved && <OkNote text={saved} />}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(() => updateDiwaniya(id, { ...form, name: form.name.trim(), area: form.area.trim() }));
        }}
      >
        <fieldset className="panel" disabled={!host}>
          <legend className="panel__title">{c.settings.basics}</legend>
          <Field label={c.board.name}>
            <input className="input" required maxLength={60} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={c.profile.area}>
            <input className="input" required maxLength={60} value={form.area} onChange={(e) => set('area', e.target.value)} />
          </Field>
          <Field label={c.settings.usualSlot} hint={c.settings.usualSlotHint}>
            <input className="input" maxLength={40} value={form.usual_slot} onChange={(e) => set('usual_slot', e.target.value)} />
          </Field>
          <Field label={c.settings.about}>
            <textarea className="input" rows={3} maxLength={500} value={form.about} onChange={(e) => set('about', e.target.value)} />
          </Field>
          <Field label={c.settings.rules}>
            <textarea className="input" rows={4} maxLength={1000} value={form.rules} onChange={(e) => set('rules', e.target.value)} />
          </Field>
        </fieldset>
        <fieldset className="panel" disabled={!host}>
          <legend className="panel__title">{c.settings.joining}</legend>
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
        </fieldset>
        {host && (
          <button className="btn btn--primary" disabled={act.busy}>
            {c.common.save}
          </button>
        )}
      </form>

      {host && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            save(() => setPin(id, Number(pin.lat), Number(pin.lng), pin.directions.trim()));
          }}
        >
          <h2 className="panel__title">{c.settings.location}</h2>
          <p className="muted small">{c.settings.locationBody}</p>
          <div className="form--grid">
            <Field label={c.settings.lat}>
              <input className="input" inputMode="decimal" required pattern="-?\d{1,2}(\.\d{1,5})?" value={pin.lat} onChange={(e) => setPinForm({ ...pin, lat: e.target.value })} />
            </Field>
            <Field label={c.settings.lng}>
              <input className="input" inputMode="decimal" required pattern="-?\d{1,3}(\.\d{1,5})?" value={pin.lng} onChange={(e) => setPinForm({ ...pin, lng: e.target.value })} />
            </Field>
          </div>
          <Field label={c.settings.directions}>
            <textarea className="input" rows={2} maxLength={300} value={pin.directions} onChange={(e) => setPinForm({ ...pin, directions: e.target.value })} />
          </Field>
          <button className="btn btn--quiet" disabled={act.busy}>
            {c.settings.saveLocation}
          </button>
        </form>
      )}

      <section className="panel" aria-labelledby="regulars-t">
        <h2 id="regulars-t" className="panel__title">
          <Star size={18} aria-hidden="true" /> {c.settings.regulars}
        </h2>
        {data.data!.regulars.length === 0 && <p className="muted">{c.settings.noRegulars}</p>}
        <ul className="people">
          {data.data!.regulars.map((r) => (
            <li key={r.user_id}>
              <a className="link" href={href.player(r.user_id)}>
                <bdi>{r.profile?.display_name ?? '؟'}</bdi>
              </a>
              <button type="button" className="btn btn--text btn--small" disabled={act.busy} onClick={() => save(() => removeRegular(id, r.user_id))}>
                {c.common.remove}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-labelledby="cohosts-t">
        <h2 id="cohosts-t" className="panel__title">
          <UserGear size={18} aria-hidden="true" /> {c.settings.cohosts}
        </h2>
        {data.data!.cohosts.length === 0 && <p className="muted">{c.settings.noCohosts}</p>}
        <ul className="people">
          {data.data!.cohosts.map((r) => (
            <li key={r.user_id}>
              <a className="link" href={href.player(r.user_id)}>
                <bdi>{r.profile?.display_name ?? '؟'}</bdi>
              </a>
              {!r.accepted_at && <span className="tag tag--saffron">{c.settings.invited}</span>}
              {(host || r.user_id === userId) && (
                <button type="button" className="btn btn--text btn--small" disabled={act.busy} onClick={() => save(() => removeCohost(id, r.user_id))}>
                  {c.common.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
