import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Lightning,
  Trash,
  UserPlus,
  Star,
  Plus,
  Megaphone,
  Moon,
  PencilSimple,
  X,
  Prohibit,
  UserGear,
  ArrowSquareOut,
  CalendarCheck,
  Armchair,
  ClipboardText,
  UsersThree,
  MapPin,
  Article,
  GearSix,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { SeatRing } from '../components/SeatRing';
import { NeedsAccount, TableRing } from '../components/account';
import { ErrorNote, Field, OkNote, Skeleton } from '../components/ui';
import { AreaSelect } from '../components/AreaSelect';
import { MapPicker, MapView, type LatLng } from '../components/Map';
import { areaLabel } from '../lib/areas';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import {
  GAMES,
  addRegular,
  announce,
  followerCount,
  lastNightAt,
  listAnnouncements,
  addTable,
  checkIn,
  clearSeat,
  closeNight,
  createDiwaniya,
  decideRequest,
  getOpenNight,
  getPin,
  listCohosts,
  listRegulars,
  listRequests,
  markRequest,
  myDiwaniyas,
  openNight,
  openSeats,
  removeCohost,
  removeRegular,
  removeTable,
  seatWalkIn,
  setNeedOne,
  setPin,
  setQueueMode,
  updateDiwaniya,
  type Diwaniya,
  type DiwaniyaSettings,
  type Game,
  type NightRow,
  type Pin,
  type RequestRow,
  type TableRow,
} from '../lib/api';
import { go, href } from '../lib/router';

const PICKED = 'dt.board.v1';

/** The start time typed on the board, as an instant in Kuwait time: today, or tomorrow if that hour is long gone. */
export function kuwaitStart(hhmm: string, now = new Date()): Date {
  const kw = new Date(now.getTime() + 3 * 3600_000);
  const day = kw.toISOString().slice(0, 10);
  let at = new Date(`${day}T${hhmm}:00+03:00`);
  if (at.getTime() < now.getTime() - 3 * 3600_000) at = new Date(at.getTime() + 24 * 3600_000);
  return at;
}

/**
 * S8 Diwaniya tab (Ali's change list 3, item 4): everything about the diwaniya on one simple page:
 * tonight, tables, requests, people, location and address, about and rules, settings. Tap any row
 * to edit it right there; the old settings sub-pages are retired into this page.
 */
export function Board({ id }: { id?: string }) {
  const { t } = usePrefs();
  return (
    <Screen title={t.diwaniya.title}>
      <NeedsAccount>
        <BoardBody want={id} />
      </NeedsAccount>
    </Screen>
  );
}

function BoardBody({ want }: { want?: string }) {
  const { err } = usePrefs();
  const mine = useAsync(myDiwaniyas, []);
  const [picked, setPicked] = useState(() => want ?? localStorage.getItem(PICKED) ?? '');
  useEffect(() => {
    if (want) setPicked(want);
  }, [want]);
  useEffect(() => {
    if (picked) localStorage.setItem(PICKED, picked);
  }, [picked]);

  if (mine.loading && !mine.data) return <Skeleton rows={2} />;
  if (mine.error != null && !mine.data) return <ErrorNote text={err(mine.error)} onRetry={mine.reload} />;
  const list = mine.data ?? [];
  const current = list.find((d) => d.id === picked) ?? list[0];
  return current ? (
    <DiwaniyaPage key={current.id} dw={current} all={list} onPick={(x) => go(href.diwaniya(x))} onChanged={mine.reload} />
  ) : (
    <CreateDiwaniya
      onCreated={(x) => {
        setPicked(x);
        mine.reload();
      }}
    />
  );
}

function CreateDiwaniya({ onCreated }: { onCreated: (id: string) => void }) {
  const { c, err } = usePrefs();
  const act = useAction();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  return (
    <section className="panel" aria-labelledby="create-t">
      <div className="panel__art">
        <SeatRing game="baloot" seats={[{ initials: 'ع' }, null, { initials: 'م' }, null]} size={112} decorative />
      </div>
      <h2 id="create-t" className="panel__title panel__title--ink">
        {c.board.createTitle}
      </h2>
      <p className="muted">{c.board.createBody}</p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => onCreated((await createDiwaniya(name.trim(), area)).id));
        }}
      >
        <Field label={c.board.name}>
          <input className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={c.profile.area} hint={c.profile.areaHint}>
          <AreaSelect required value={area} onChange={setArea} />
        </Field>
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary" disabled={act.busy}>
          {c.board.create}
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- tap-to-edit building blocks

/** A labelled section of the one page, with its icon. */
function Part({ id, icon: I, title, children, live, wide }: { id: string; icon: Icon; title: string; children: ReactNode; live?: boolean; wide?: boolean }) {
  return (
    <section className={wide ? "dw-part dw-part--wide" : "dw-part"} aria-labelledby={`${id}-t`} aria-live={live ? "polite" : undefined}>
      <h2 id={`${id}-t`} className="dw-part__title">
        <I size={20} aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * One fact about the diwaniya. Tapping it opens its editor in place (Save, or red Cancel); people
 * who can't change it (a co-host) see the same row without the pencil.
 */
export function EditRow({ label, value, editable, editor }: { label: string; value: ReactNode; editable: boolean; editor: (close: () => void) => ReactNode }) {
  const { c } = usePrefs();
  const [open, setOpen] = useState(false);
  // Keyboard users land back on the row they edited (Save, Cancel or Esc), not on the page.
  const row = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!open && refocus.current) {
      refocus.current = false;
      row.current?.focus();
    }
  }, [open]);
  const close = () => {
    refocus.current = true;
    setOpen(false);
  };
  if (open && editable) return <div className="edit-row edit-row--open">{editor(close)}</div>;
  if (!editable) {
    return (
      <div className="edit-row edit-row--static">
        <span className="edit-row__label">{label}</span>
        <span className="edit-row__value">{value}</span>
      </div>
    );
  }
  return (
    <button ref={row} type="button" className="edit-row" aria-label={`${c.page.edit(label)}: ${typeof value === 'string' ? value : ''}`.replace(/: $/, '')} onClick={() => setOpen(true)}>
      <span className="edit-row__label">{label}</span>
      <span className="edit-row__value">{value}</span>
      <PencilSimple size={18} aria-hidden="true" className="edit-row__pencil" />
    </button>
  );
}

/** The editor form inside a row: its fields, Save, and a red Cancel that throws the change away. */
function Editor({ label, onSave, close, children, saveDisabled }: { label: string; onSave: () => Promise<unknown>; close: () => void; children: ReactNode; saveDisabled?: boolean }) {
  const { c, err } = usePrefs();
  const act = useAction();
  return (
    <form
      className="editor"
      aria-label={c.page.edit(label)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void act.run(async () => {
          await onSave();
          close();
        });
      }}
    >
      {children}
      {act.error != null && <ErrorNote text={err(act.error)} />}
      <div className="editor__acts">
        <button className="btn btn--primary btn--small" disabled={act.busy || saveDisabled}>
          {c.common.save}
        </button>
        <CancelButton onClick={close} />
      </div>
    </form>
  );
}

/** Red, with an X and words (Ali's change list 3, item 6). */
export function CancelButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { c } = usePrefs();
  return (
    <button type="button" className="btn btn--danger btn--small" onClick={onClick}>
      <X size={16} aria-hidden="true" />
      {label ?? c.page.cancel}
    </button>
  );
}

// ---------------------------------------------------------------- the page

function DiwaniyaPage({ dw, all, onPick, onChanged }: { dw: Diwaniya; all: Diwaniya[]; onPick: (id: string) => void; onChanged: () => void }) {
  const { c, err, fmt, time, prefs } = usePrefs();
  const { userId } = useSession();
  const host = dw.host_id === userId;
  const night = useAsync(() => getOpenNight(dw.id), [dw.id], ['nights', 'game_tables', 'seats', 'table_queue']);
  const extra = useAsync(async () => {
    const [pin, regulars, cohosts] = await Promise.all([getPin(dw.id), listRegulars(dw.id), listCohosts(dw.id)]);
    return { pin, regulars, cohosts };
  }, [dw.id], ['regulars', 'cohosts']);
  const act = useAction();
  const [notice, setNotice] = useState('');
  const run = (fn: () => Promise<unknown>, ok = '') =>
    void act.run(async () => {
      await fn();
      setNotice(ok);
      night.reload();
      extra.reload();
    });
  const save = (patch: Partial<DiwaniyaSettings>) => async () => {
    await updateDiwaniya(dw.id, patch);
    setNotice(c.common.saved);
    onChanged();
  };

  return (
    <div className="dw-page">
      <header className="dw-head">
        {all.length > 1 && (
          <Field label={c.board.pick}>
            <select className="input" value={dw.id} onChange={(e) => onPick(e.target.value)}>
              {all.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="dw-head__row">
          <h2 className="place__name">
            <bdi>{dw.name}</bdi>
          </h2>
          <a className="btn btn--quiet btn--small" href={href.place(dw.id)}>
            <ArrowSquareOut size={18} aria-hidden="true" className="flip-rtl" />
            {c.page.view}
          </a>
        </div>
        <p className="place__meta muted">
          <MapPin size={16} aria-hidden="true" /> <bdi>{areaLabel(dw.area, prefs.lang)}</bdi>
          {dw.usual_slot && <> · {c.place.usually(dw.usual_slot)}</>}
        </p>
      </header>

      {act.error != null && <ErrorNote text={err(act.error)} />}
      {notice && <OkNote text={notice} />}

      {/* ---------- Tonight ---------- */}
      <Part id="dw-tonight" icon={CalendarCheck} title={c.page.tonight} wide>
        {night.loading && !night.data ? (
          <Skeleton rows={1} />
        ) : night.error != null && night.data === undefined ? (
          <ErrorNote text={err(night.error)} onRetry={night.reload} />
        ) : !night.data ? (
          <OpenTonight id={dw.id} busy={act.busy} onOpen={(at) => run(() => openNight(dw.id, at))} />
        ) : (
          <>
            <div className="dw-tonight">
              <p className="dw-tonight__state">
                <span className="tag tag--saffron">{c.board.nightOpen(time(night.data.starts_at))}</span>
              </p>
              <button
                type="button"
                className="btn btn--danger btn--small"
                disabled={act.busy}
                onClick={() => window.confirm(c.board.closeConfirm) && run(() => closeNight(night.data!.id))}
              >
                <Prohibit size={16} aria-hidden="true" />
                {c.board.closeNight}
              </button>
            </div>
            <Announce nightId={night.data.id} />
          </>
        )}
      </Part>

      {/* ---------- Requests ---------- */}
      {night.data && (
        <Part id="dw-requests" icon={ClipboardText} title={c.page.requests} live>
          <Requests dw={dw} night={night.data} />
        </Part>
      )}

      {/* ---------- Tables ---------- */}
      {night.data && (
        <Part id="dw-tables" icon={Armchair} title={c.page.tables} wide>
          {night.data.tables.length === 0 && <p className="muted">{c.page.noTables}</p>}
          <ul className="tables">
            {night.data.tables.map((tb) => (
              <BoardTable key={tb.id} table={tb} busy={act.busy} run={run} onPinged={(n) => setNotice(c.board.pinged(n, fmt))} />
            ))}
          </ul>
          <AddTable nightId={night.data.id} busy={act.busy} run={run} />
        </Part>
      )}

      {/* ---------- People ---------- */}
      <Part id="dw-people" icon={UsersThree} title={c.page.people}>
        {extra.data ? (
          <People
            regulars={extra.data.regulars}
            cohosts={extra.data.cohosts}
            host={host}
            me={userId}
            busy={act.busy}
            onRemoveRegular={(u) => run(() => removeRegular(dw.id, u))}
            onRemoveCohost={(u) => run(() => removeCohost(dw.id, u))}
          />
        ) : (
          <Skeleton rows={1} />
        )}
      </Part>

      {/* ---------- Location and address ---------- */}
      <Part id="dw-location" icon={MapPin} title={c.page.location}>
        {extra.data ? <Location dw={dw} pin={extra.data.pin} host={host} onSaved={() => { setNotice(c.common.saved); extra.reload(); onChanged(); }} /> : <Skeleton rows={1} />}
      </Part>

      {/* ---------- About and rules ---------- */}
      <Part id="dw-rules" icon={Article} title={c.page.rules}>
        <div className="edit-list">
          <TextRow label={c.settings.about} value={dw.about} editable={host} max={500} rows={3} onSave={(v) => save({ about: v })()} />
          <TextRow label={c.settings.rules} value={dw.rules} editable={host} max={1000} rows={4} onSave={(v) => save({ rules: v })()} />
        </div>
      </Part>

      {/* ---------- Settings ---------- */}
      <Part id="dw-settings" icon={GearSix} title={c.page.settings}>
        <div className="edit-list">
          <TextRow label={c.board.name} value={dw.name} editable={host} max={60} required onSave={(v) => save({ name: v.trim() })()} />
          <EditRow
            label={c.profile.area}
            value={<bdi>{areaLabel(dw.area, prefs.lang)}</bdi>}
            editable={host}
            editor={(close) => <AreaEditor label={c.profile.area} value={dw.area} close={close} onSave={(v) => save({ area: v })()} />}
          />
          <TextRow label={c.settings.usualSlot} hint={c.settings.usualSlotHint} value={dw.usual_slot} editable={host} max={40} onSave={(v) => save({ usual_slot: v })()} />
          <ChoiceRow
            label={c.settings.visibility}
            value={dw.visibility}
            options={(['public', 'followers'] as const).map((v) => ({ value: v, label: c.settings.visibilityOpts[v] }))}
            editable={host}
            onSave={(v) => save({ visibility: v })()}
          />
          <ChoiceRow
            label={c.settings.approval}
            value={dw.approval}
            options={(['host', 'regulars_auto'] as const).map((v) => ({ value: v, label: c.settings.approvalOpts[v] }))}
            editable={host}
            onSave={(v) => save({ approval: v })()}
          />
          <NumberRow label={c.settings.guestCap} value={dw.guest_cap} min={0} max={30} step={1} editable={host} onSave={(v) => save({ guest_cap: v })()} />
          <ChoiceRow
            label={c.messages.setting}
            value={dw.messages_on ? 'on' : 'off'}
            options={(['on', 'off'] as const).map((v) => ({ value: v, label: c.messages.settingOpts[v] }))}
            editable={host}
            onSave={(v) => save({ messages_on: v === 'on' })()}
          />
        </div>
      </Part>
    </div>
  );
}


function OpenTonight({ id, busy, onOpen }: { id: string; busy: boolean; onOpen: (at: Date) => void }) {
  const { c } = usePrefs();
  const [startAt, setStartAt] = useState('21:00');
  return (
    <>
      <QuietNudge id={id} />
      <form
        className="form form--row"
        onSubmit={(e) => {
          e.preventDefault();
          onOpen(kuwaitStart(startAt));
        }}
      >
        <Field label={c.board.startsAt}>
          <input className="input input--time" type="time" required value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </Field>
        <button className="btn btn--primary" disabled={busy}>
          {c.board.openTonight}
        </button>
      </form>
    </>
  );
}

function TextRow({
  label,
  value,
  editable,
  max,
  rows,
  required,
  hint,
  onSave,
}: {
  label: string;
  value: string;
  editable: boolean;
  max: number;
  rows?: number;
  required?: boolean;
  hint?: string;
  onSave: (v: string) => Promise<unknown>;
}) {
  const { c } = usePrefs();
  return (
    <EditRow
      label={label}
      value={value ? <bdi className={rows ? 'edit-row__long' : undefined}>{value}</bdi> : <span className="muted">{c.page.notSet}</span>}
      editable={editable}
      editor={(close) => <TextEditor label={label} initial={value} max={max} rows={rows} required={required} hint={hint} close={close} onSave={onSave} />}
    />
  );
}

function TextEditor({ label, initial, max, rows, required, hint, close, onSave }: { label: string; initial: string; max: number; rows?: number; required?: boolean; hint?: string; close: () => void; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState(initial);
  return (
    <Editor label={label} close={close} onSave={() => onSave(v)} saveDisabled={required && v.trim() === ''}>
      <Field label={label} hint={hint}>
        {rows ? (
          <textarea className="input" rows={rows} maxLength={max} value={v} autoFocus onChange={(e) => setV(e.target.value)} />
        ) : (
          <input className="input" maxLength={max} required={required} value={v} autoFocus onChange={(e) => setV(e.target.value)} />
        )}
      </Field>
    </Editor>
  );
}

function AreaEditor({ label, value, close, onSave }: { label: string; value: string; close: () => void; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState(value);
  return (
    <Editor label={label} close={close} onSave={() => onSave(v)} saveDisabled={!v}>
      <Field label={label}>
        <AreaSelect required value={v} onChange={setV} />
      </Field>
    </Editor>
  );
}

function ChoiceRow<T extends string>({ label, value, options, editable, onSave }: { label: string; value: T; options: { value: T; label: string }[]; editable: boolean; onSave: (v: T) => Promise<unknown> }) {
  return (
    <EditRow
      label={label}
      value={options.find((o) => o.value === value)?.label ?? value}
      editable={editable}
      editor={(close) => <ChoiceEditor label={label} value={value} options={options} close={close} onSave={onSave} />}
    />
  );
}

function ChoiceEditor<T extends string>({ label, value, options, close, onSave }: { label: string; value: T; options: { value: T; label: string }[]; close: () => void; onSave: (v: T) => Promise<unknown> }) {
  const [v, setV] = useState<T>(value);
  return (
    <Editor label={label} close={close} onSave={() => onSave(v)}>
      <Field label={label}>
        <select className="input" value={v} autoFocus onChange={(e) => setV(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </Editor>
  );
}

function NumberRow({ label, value, min, max, step, editable, suffix, onSave }: { label: string; value: number; min: number; max: number; step: number; editable: boolean; suffix?: (n: number) => string; onSave: (v: number) => Promise<unknown> }) {
  const { fmt } = usePrefs();
  return (
    <EditRow
      label={label}
      value={suffix ? suffix(value) : fmt(value)}
      editable={editable}
      editor={(close) => <NumberEditor label={label} value={value} min={min} max={max} step={step} close={close} onSave={onSave} />}
    />
  );
}

function NumberEditor({ label, value, min, max, step, close, onSave }: { label: string; value: number; min: number; max: number; step: number; close: () => void; onSave: (v: number) => Promise<unknown> }) {
  const [v, setV] = useState(String(value));
  const n = Number(v);
  return (
    <Editor label={label} close={close} onSave={() => onSave(n)} saveDisabled={!Number.isInteger(n) || n < min || n > max}>
      <Field label={label}>
        <input className="input input--num" type="number" min={min} max={max} step={step} required value={v} autoFocus onChange={(e) => setV(e.target.value)} />
      </Field>
    </Editor>
  );
}

function Location({ dw, pin, host, onSaved }: { dw: Diwaniya; pin: Pin | null; host: boolean; onSaved: () => void }) {
  const { c, fmt } = usePrefs();
  const at = pin ? { lat: Number(pin.lat), lng: Number(pin.lng) } : null;
  return (
    <div className="edit-list">
      <p className="muted small">{c.settings.locationBody}</p>
      {at && <MapView at={at} />}
      <EditRow
        label={c.settings.address}
        value={pin?.address ? <bdi>{pin.address}</bdi> : <span className="muted">{pin ? c.page.notSet : c.page.noPin}</span>}
        editable={host}
        editor={(close) => <LocationEditor dw={dw} pin={pin} close={close} onSaved={onSaved} />}
      />
      <EditRow
        label={c.settings.directions}
        value={pin?.directions ? <bdi>{pin.directions}</bdi> : <span className="muted">{c.page.notSet}</span>}
        editable={host}
        editor={(close) => <LocationEditor dw={dw} pin={pin} close={close} onSaved={onSaved} />}
      />
      <NumberRow
        label={c.settings.pinUnlock}
        value={dw.pin_unlock_minutes}
        min={0}
        max={720}
        step={15}
        editable={host}
        suffix={(n) => c.page.minutes(n, fmt)}
        onSave={async (v) => {
          await updateDiwaniya(dw.id, { pin_unlock_minutes: v });
          onSaved();
        }}
      />
      {!host && <p className="muted">{c.map.hostOnly}</p>}
    </div>
  );
}

function LocationEditor({ dw, pin, close, onSaved }: { dw: Diwaniya; pin: Pin | null; close: () => void; onSaved: () => void }) {
  const { c } = usePrefs();
  const [at, setAt] = useState<LatLng | null>(pin ? { lat: Number(pin.lat), lng: Number(pin.lng) } : null);
  const [address, setAddress] = useState(pin?.address ?? '');
  const [directions, setDirections] = useState(pin?.directions ?? '');
  return (
    <Editor
      label={c.page.location}
      close={close}
      saveDisabled={!at}
      onSave={async () => {
        if (!at) return;
        await setPin(dw.id, at.lat, at.lng, directions.trim(), address.trim().replace(/[\u0000-\u001f\u007f]/g, ' '));
        onSaved();
      }}
    >
      <MapPicker value={at} onChange={setAt} />
      {!at && <p className="muted small">{c.map.needPin}</p>}
      <Field label={c.settings.address} hint={c.settings.addressHint}>
        <textarea className="input" rows={2} maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
      </Field>
      <Field label={c.settings.directions}>
        <textarea className="input" rows={2} maxLength={300} value={directions} onChange={(e) => setDirections(e.target.value)} />
      </Field>
    </Editor>
  );
}

function People({
  regulars,
  cohosts,
  host,
  me,
  busy,
  onRemoveRegular,
  onRemoveCohost,
}: {
  regulars: { user_id: string; profile: { display_name: string } | null }[];
  cohosts: { user_id: string; accepted_at: string | null; profile: { display_name: string } | null }[];
  host: boolean;
  me: string | null;
  busy: boolean;
  onRemoveRegular: (u: string) => void;
  onRemoveCohost: (u: string) => void;
}) {
  const { c } = usePrefs();
  return (
    <div className="people-parts">
      <h3 className="setting__label">
        <Star size={16} aria-hidden="true" /> {c.settings.regulars}
      </h3>
      {regulars.length === 0 && <p className="muted">{c.settings.noRegulars}</p>}
      <ul className="people">
        {regulars.map((r) => (
          <li key={r.user_id}>
            <a className="link" href={href.player(r.user_id)}>
              <bdi>{r.profile?.display_name ?? '؟'}</bdi>
            </a>
            <RemoveButton label={`${c.common.remove} · ${r.profile?.display_name ?? ''}`} busy={busy} onClick={() => onRemoveRegular(r.user_id)} />
          </li>
        ))}
      </ul>
      <h3 className="setting__label">
        <UserGear size={16} aria-hidden="true" /> {c.settings.cohosts}
      </h3>
      {cohosts.length === 0 && <p className="muted">{c.settings.noCohosts}</p>}
      <ul className="people">
        {cohosts.map((r) => (
          <li key={r.user_id}>
            <a className="link" href={href.player(r.user_id)}>
              <bdi>{r.profile?.display_name ?? '؟'}</bdi>
            </a>
            {!r.accepted_at && <span className="tag tag--saffron">{c.settings.invited}</span>}
            {(host || r.user_id === me) && <RemoveButton label={`${c.common.remove} · ${r.profile?.display_name ?? ''}`} busy={busy} onClick={() => onRemoveCohost(r.user_id)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Red remove with a bin icon and the word; the aria-label names who or what goes. */
function RemoveButton({ label, busy, onClick, text }: { label: string; busy: boolean; onClick: () => void; text?: string }) {
  const { c } = usePrefs();
  return (
    <button type="button" className="btn btn--danger btn--small" aria-label={label} disabled={busy} onClick={onClick}>
      <Trash size={16} aria-hidden="true" />
      {text ?? c.common.remove}
    </button>
  );
}

/** Quiet-night nudge (regulars and follow, ADC-RES-49 s.5): how long since the last night, who waits. */
export function QuietNudge({ id }: { id: string }) {
  const { c, fmt } = usePrefs();
  const data = useAsync(async () => {
    const [last, followers] = await Promise.all([lastNightAt(id), followerCount(id)]);
    return { last, followers };
  }, [id]);
  if (!data.data) return <p className="muted">{c.nudge.fresh}</p>;
  const { last, followers } = data.data;
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : null;
  const text =
    days == null ? c.nudge.never : days >= 6 ? c.nudge.days(days, fmt) + c.nudge.followers(followers, fmt) : c.nudge.fresh + c.nudge.followers(followers, fmt);
  return (
    <p className="nudge">
      <Moon size={20} weight="fill" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/** The host's note to tonight's approved guests (5 a night). */
function Announce({ nightId }: { nightId: string }) {
  const { c, fmt, time, err } = usePrefs();
  const log = useAsync(() => listAnnouncements(nightId), [nightId]);
  const act = useAction();
  const [text, setText] = useState('');
  const [sent, setSent] = useState('');
  const used = log.data?.length ?? 0;
  return (
    <div className="announce" aria-labelledby="announce-t">
      <h3 id="announce-t" className="setting__label">
        <Megaphone size={16} aria-hidden="true" /> {c.announce.title}
      </h3>
      <p className="muted small">{c.announce.body}</p>
      <form
        className="announce__form"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            const n = await announce(nightId, text);
            setText('');
            setSent(c.announce.sent(n, fmt));
            log.reload();
          });
        }}
      >
        <Field label={c.announce.label} hint={c.announce.left(Math.max(0, 5 - used), fmt)}>
          <textarea className="input" rows={2} maxLength={300} required placeholder={c.announce.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {act.error != null && <ErrorNote text={err(act.error)} />}
        {sent && <OkNote text={sent} />}
        <button className="btn btn--quiet" disabled={act.busy || used >= 5 || text.trim() === ''}>
          <Megaphone size={18} aria-hidden="true" />
          {c.announce.send}
        </button>
      </form>
      {used > 0 && (
        <>
          <h4 className="setting__label">{c.announce.log}</h4>
          <ul className="announce__log">
            {log.data!.map((a) => (
              <li key={a.id}>
                <bdi>{a.body}</bdi>
                <span className="muted small">{time(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function BoardTable({ table, busy, run, onPinged }: { table: TableRow; busy: boolean; run: (fn: () => Promise<unknown>, ok?: string) => void; onPinged: (n: number) => void }) {
  const { c, t, fmt } = usePrefs();
  const [walkIn, setWalkIn] = useState('');
  const free = Array.from({ length: table.seat_count }, (_, i) => i + 1).filter((n) => !table.seats.some((s) => s.seat_no === n));
  return (
    <li className="table-block table-block--host">
      <TableRing table={table} size={112} />
      <div className="table-block__side">
        <button
          type="button"
          className={table.need_one ? 'btn btn--saffron btn--small' : 'btn btn--quiet btn--small'}
          aria-pressed={table.need_one}
          disabled={busy || (!table.need_one && openSeats(table) === 0)}
          onClick={() =>
            run(async () => {
              const n = await setNeedOne(table.id, !table.need_one);
              if (!table.need_one) onPinged(n);
            })
          }
        >
          <Lightning size={18} weight={table.need_one ? 'fill' : 'regular'} aria-hidden="true" />
          {table.need_one ? c.board.needOneOff : c.board.needOne}
        </button>
        {free.length > 0 && (
          <>
            <button type="button" className="btn btn--quiet btn--small" disabled={busy} onClick={() => run(() => checkIn(table.id, free[0]))}>
              {c.board.sitMe}
            </button>
            <form
              className="form form--walkin"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await seatWalkIn(table.id, free[0], walkIn.trim());
                  setWalkIn('');
                });
              }}
            >
              <Field label={c.board.walkInName}>
                <input className="input" required maxLength={40} value={walkIn} onChange={(e) => setWalkIn(e.target.value)} />
              </Field>
              <button className="btn btn--quiet btn--small" disabled={busy}>
                <UserPlus size={18} aria-hidden="true" />
                {c.board.walkIn}
              </button>
            </form>
          </>
        )}
        {table.seats.length > 0 && (
          <ul className="seated">
            {[...table.seats]
              .sort((a, b) => a.seat_no - b.seat_no)
              .map((s) => (
                <li key={s.seat_no}>
                  <span>
                    {fmt(s.seat_no)} · <bdi>{s.profile?.display_name ?? s.walk_in_name}</bdi>
                  </span>
                  <RemoveButton label={`${c.board.clearSeat} ${fmt(s.seat_no)}`} busy={busy} onClick={() => run(() => clearSeat(table.id, s.seat_no))} />
                </li>
              ))}
          </ul>
        )}
        <Field label={c.place.queue}>
          <select className="input" value={table.queue_mode} disabled={busy} onChange={(e) => run(() => setQueueMode(table.id, e.target.value as TableRow['queue_mode']))}>
            <option value="rotation">{c.place.queueMode.rotation}</option>
            <option value="winner_stays">{c.place.queueMode.winner_stays}</option>
          </select>
        </Field>
        <RemoveButton label={`${c.board.removeTable} (${t.games[table.game]})`} text={c.board.removeTable} busy={busy} onClick={() => run(() => removeTable(table.id))} />
      </div>
    </li>
  );
}

function AddTable({ nightId, busy, run }: { nightId: string; busy: boolean; run: (fn: () => Promise<unknown>, ok?: string) => void }) {
  const { c, t, fmt } = usePrefs();
  const [game, setGame] = useState<Game>('kout');
  const [seats, setSeats] = useState(6);
  const [label, setLabel] = useState('');
  return (
    <div className="add-table">
      <h3 className="setting__label">
        <Plus size={16} aria-hidden="true" /> {c.board.addTable}
      </h3>
      <form
        className="form form--grid"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await addTable(nightId, game, game === 'kout' ? seats : 4, label.trim());
            setLabel('');
          });
        }}
      >
        <Field label={c.board.game}>
          <select
            className="input"
            value={game}
            onChange={(e) => {
              const g = e.target.value as Game;
              setGame(g);
              setSeats(g === 'kout' ? 6 : 4);
            }}
          >
            {GAMES.map((g) => (
              <option key={g} value={g}>
                {t.games[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.board.seats}>
          <select className="input" value={seats} disabled={game !== 'kout'} onChange={(e) => setSeats(Number(e.target.value))}>
            {(game === 'kout' ? [6, 4] : [4]).map((n) => (
              <option key={n} value={n}>
                {fmt(n)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.board.label}>
          <input className="input" maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <button className="btn btn--primary" disabled={busy}>
          <Plus size={18} aria-hidden="true" />
          {c.board.add}
        </button>
      </form>
    </div>
  );
}

const ORDER: Record<RequestRow['status'], number> = { pending: 0, approved: 1, arrived: 2, no_show: 3, declined: 4, cancelled: 5 };

function Requests({ dw, night }: { dw: Diwaniya; night: NightRow }) {
  const { c, fmt, err, prefs } = usePrefs();
  const reqs = useAsync(() => listRequests(night.id), [night.id], ['requests']);
  const act = useAction();
  const run = (fn: () => Promise<unknown>) =>
    void act.run(async () => {
      await fn();
      reqs.reload();
    });
  const started = new Date(night.starts_at).getTime() <= Date.now();
  const list = [...(reqs.data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.created_at.localeCompare(b.created_at));
  return (
    <>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {reqs.error != null && !reqs.data && <ErrorNote text={err(reqs.error)} onRetry={reqs.reload} />}
      {list.length === 0 && !reqs.loading && <p className="muted">{c.board.noRequests}</p>}
      <ul className="requests">
        {list.map((r) => (
          <li key={r.id} className="request">
            <div className="request__who">
              <a className="link" href={href.player(r.user?.id ?? '')}>
                <bdi>{r.user?.display_name}</bdi>
              </a>
              <span className="muted small">
                <bdi>{areaLabel(r.user?.area, prefs.lang)}</bdi> · {c.board.eta(c.common.minutes(r.eta_minutes, fmt))}
              </span>
              {r.note && (
                <span className="small">
                  <bdi>{r.note}</bdi>
                </span>
              )}
            </div>
            <span key={r.status} className={`status status--${r.status}`}>
              {c.status[r.status]}
            </span>
            <div className="request__acts">
              {r.status === 'pending' && (
                <>
                  <button type="button" className="btn btn--primary btn--small" disabled={act.busy} onClick={() => run(() => decideRequest(r.id, true))}>
                    {c.board.approve}
                  </button>
                  <button type="button" className="btn btn--danger btn--small" disabled={act.busy} onClick={() => run(() => decideRequest(r.id, false))}>
                    <X size={16} aria-hidden="true" />
                    {c.board.decline}
                  </button>
                </>
              )}
              {r.status === 'approved' && (
                <>
                  <button type="button" className="btn btn--quiet btn--small" disabled={act.busy} onClick={() => run(() => markRequest(r.id, 'arrived'))}>
                    {c.board.arrived}
                  </button>
                  {started && (
                    <button type="button" className="btn btn--text btn--small" disabled={act.busy} onClick={() => run(() => markRequest(r.id, 'no_show'))}>
                      {c.board.noShow}
                    </button>
                  )}
                </>
              )}
              {r.status === 'arrived' && r.user && (
                <button type="button" className="btn btn--camel btn--small" disabled={act.busy} onClick={() => run(() => addRegular(dw.id, r.user!.id))}>
                  <Star size={16} aria-hidden="true" />
                  {c.board.makeRegular}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
