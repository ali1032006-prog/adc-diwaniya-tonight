import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  Check,
  FloppyDisk,
  ArrowDown,
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

// ---------------------------------------------------------------- the page's building blocks

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
 * One typed fact about the diwaniya. Tapping it opens its box in place; what is typed waits for
 * the page's one Save at the bottom (ADC-LOG-794 item 3). Done keeps it, red Cancel (or Esc) puts
 * the field back. People who can't change it (a co-host) see the same row without the pencil.
 */
export function EditRow({
  label,
  value,
  editable,
  changed,
  editor,
  onOpen,
  onCancel,
}: {
  label: string;
  value: ReactNode;
  editable: boolean;
  changed?: boolean;
  editor: () => ReactNode;
  /** Called as the box opens, so Cancel knows what to put back. */
  onOpen: () => void;
  onCancel: () => void;
}) {
  const { c } = usePrefs();
  const [open, setOpen] = useState(false);
  // Keyboard users land back on the row they edited (Done, Cancel or Esc), not on the page.
  const row = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!open && refocus.current) {
      refocus.current = false;
      row.current?.focus();
    }
  }, [open]);
  const close = (cancel: boolean) => {
    if (cancel) onCancel();
    refocus.current = true;
    setOpen(false);
  };
  if (open && editable) {
    return (
      <div
        className="edit-row edit-row--open"
        role="group"
        aria-label={c.page.edit(label)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close(true);
          }
        }}
      >
        <div className="editor">
          {editor()}
          <div className="editor__acts">
            <button type="button" className="btn btn--quiet btn--small" onClick={() => close(false)}>
              <Check size={16} aria-hidden="true" />
              {c.page.done}
            </button>
            <CancelButton onClick={() => close(true)} />
          </div>
        </div>
      </div>
    );
  }
  if (!editable) {
    return (
      <div className="edit-row edit-row--static">
        <span className="edit-row__label">{label}</span>
        <span className="edit-row__value">{value}</span>
      </div>
    );
  }
  return (
    <button
      ref={row}
      type="button"
      className={changed ? 'edit-row edit-row--changed' : 'edit-row'}
      aria-label={`${c.page.edit(label)}: ${typeof value === 'string' ? value : ''}${changed ? ` (${c.page.changed})` : ''}`.replace(/: $/, '')}
      onClick={() => {
        onOpen();
        setOpen(true);
      }}
    >
      <span className="edit-row__label">{label}</span>
      <span className="edit-row__value">{value}</span>
      <span className="edit-row__end">
        {changed && <span className="edit-row__dot" aria-hidden="true" />}
        <PencilSimple size={18} aria-hidden="true" className="edit-row__pencil" />
      </span>
    </button>
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

/**
 * A fact chosen from a list: the dropdown itself sits on the page, no pencil (ADC-LOG-794 item 3).
 * A co-host sees the chosen value as text.
 */
function SelectRow<T extends string>({ label, value, options, editable, changed, onChange }: { label: string; value: T; options: { value: T; label: string }[]; editable: boolean; changed?: boolean; onChange: (v: T) => void }) {
  if (!editable) {
    return (
      <div className="edit-row edit-row--static">
        <span className="edit-row__label">{label}</span>
        <span className="edit-row__value">{options.find((o) => o.value === value)?.label ?? value}</span>
      </div>
    );
  }
  return (
    <label className={changed ? 'dw-field dw-field--changed' : 'dw-field'}>
      <span className="dw-field__label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The area, a grouped dropdown on the page. */
function AreaRow({ value, editable, changed, onChange }: { value: string; editable: boolean; changed?: boolean; onChange: (v: string) => void }) {
  const { c, prefs } = usePrefs();
  if (!editable) {
    return (
      <div className="edit-row edit-row--static">
        <span className="edit-row__label">{c.profile.area}</span>
        <span className="edit-row__value">
          <bdi>{areaLabel(value, prefs.lang)}</bdi>
        </span>
      </div>
    );
  }
  return (
    <label className={changed ? 'dw-field dw-field--changed' : 'dw-field'}>
      <span className="dw-field__label">{c.profile.area}</span>
      <AreaSelect required value={value} onChange={onChange} />
    </label>
  );
}

function TextRow({
  label,
  value,
  saved,
  editable,
  max,
  rows,
  required,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  saved: string;
  editable: boolean;
  max: number;
  rows?: number;
  required?: boolean;
  hint?: string;
  onChange: (v: string) => void;
}) {
  const { c } = usePrefs();
  const before = useRef(value);
  return (
    <EditRow
      label={label}
      value={value ? <bdi className={rows ? 'edit-row__long' : undefined}>{value}</bdi> : <span className="muted">{c.page.notSet}</span>}
      editable={editable}
      changed={value !== saved}
      onOpen={() => (before.current = value)}
      onCancel={() => onChange(before.current)}
      editor={() => <TextBox label={label} value={value} max={max} rows={rows} required={required} hint={hint} onChange={onChange} />}
    />
  );
}

function TextBox({ label, value, max, rows, required, hint, onChange }: { label: string; value: string; max: number; rows?: number; required?: boolean; hint?: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint}>
      {rows ? (
        <textarea className="input" rows={rows} maxLength={max} value={value} autoFocus onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" maxLength={max} required={required} value={value} autoFocus onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function NumberRow({ label, value, saved, min, max, step, editable, suffix, onChange }: { label: string; value: number; saved: number; min: number; max: number; step: number; editable: boolean; suffix?: (n: number) => string; onChange: (v: number) => void }) {
  const { fmt } = usePrefs();
  const before = useRef(value);
  return (
    <EditRow
      label={label}
      value={suffix ? suffix(value) : fmt(value)}
      editable={editable}
      changed={value !== saved}
      onOpen={() => (before.current = value)}
      onCancel={() => onChange(before.current)}
      editor={() => <NumberBox label={label} value={value} min={min} max={max} step={step} onChange={onChange} />}
    />
  );
}

function NumberBox({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <Field label={label}>
      <input
        className="input input--num"
        type="number"
        min={min}
        max={max}
        step={step}
        required
        value={v}
        autoFocus
        onChange={(e) => {
          setV(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isInteger(n)) onChange(n);
        }}
      />
    </Field>
  );
}

export interface PinDraft {
  at: LatLng | null;
  address: string;
  directions: string;
}
const pinOf = (pin: Pin | null): PinDraft => ({ at: pin ? { lat: Number(pin.lat), lng: Number(pin.lng) } : null, address: pin?.address ?? '', directions: pin?.directions ?? '' });
const samePin = (a: PinDraft, b: PinDraft) => a.at?.lat === b.at?.lat && a.at?.lng === b.at?.lng && a.address === b.address && a.directions === b.directions;

/** Location and address, last on the page (ADC-LOG-794 item 3); edits wait for the one Save. */
function Location({ pin, draft, unlock, savedUnlock, host, onPin, onUnlock }: { pin: Pin | null; draft: PinDraft; unlock: number; savedUnlock: number; host: boolean; onPin: (p: PinDraft) => void; onUnlock: (n: number) => void }) {
  const { c, fmt } = usePrefs();
  const saved = pinOf(pin);
  const before = useRef(draft);
  const changed = !samePin(draft, saved);
  const editor = () => <LocationBox draft={draft} onChange={onPin} />;
  const opened = () => (before.current = draft);
  return (
    <div className="edit-list">
      <p className="muted small">{c.settings.locationBody}</p>
      {draft.at && <MapView at={draft.at} />}
      <EditRow
        label={c.settings.address}
        value={draft.address ? <bdi>{draft.address}</bdi> : <span className="muted">{draft.at ? c.page.notSet : c.page.noPin}</span>}
        editable={host}
        changed={changed}
        onOpen={opened}
        onCancel={() => onPin(before.current)}
        editor={editor}
      />
      <EditRow
        label={c.settings.directions}
        value={draft.directions ? <bdi>{draft.directions}</bdi> : <span className="muted">{c.page.notSet}</span>}
        editable={host}
        changed={changed}
        onOpen={opened}
        onCancel={() => onPin(before.current)}
        editor={editor}
      />
      <NumberRow label={c.settings.pinUnlock} value={unlock} saved={savedUnlock} min={0} max={720} step={15} editable={host} suffix={(n) => c.page.minutes(n, fmt)} onChange={onUnlock} />
      {!host && <p className="muted">{c.map.hostOnly}</p>}
    </div>
  );
}

function LocationBox({ draft, onChange }: { draft: PinDraft; onChange: (p: PinDraft) => void }) {
  const { c } = usePrefs();
  return (
    <>
      <MapPicker value={draft.at} onChange={(at) => onChange({ ...draft, at })} />
      {!draft.at && <p className="muted small">{c.map.needPin}</p>}
      <Field label={c.settings.address} hint={c.settings.addressHint}>
        <textarea className="input" rows={2} maxLength={200} value={draft.address} onChange={(e) => onChange({ ...draft, address: e.target.value })} autoComplete="street-address" />
      </Field>
      <Field label={c.settings.directions}>
        <textarea className="input" rows={2} maxLength={300} value={draft.directions} onChange={(e) => onChange({ ...draft, directions: e.target.value })} />
      </Field>
    </>
  );
}

/** The settings patch the host has made but not saved: only the fields that differ. */
export function settingsPatch(dw: Diwaniya, draft: Partial<DiwaniyaSettings>): Partial<DiwaniyaSettings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) if ((dw as unknown as Record<string, unknown>)[k] !== v) out[k] = v;
  return out as Partial<DiwaniyaSettings>;
}

// ---------------------------------------------------------------- the page

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const saving = useAction();
  const [notice, setNotice] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [check, setCheck] = useState('');
  const run = (fn: () => Promise<unknown>, ok = '') =>
    void act.run(async () => {
      await fn();
      setNotice(ok);
      night.reload();
      extra.reload();
    });

  // Everything the host changes waits here until the one Save at the bottom (ADC-LOG-794 item 3).
  const [draft, setDraft] = useState<Partial<DiwaniyaSettings>>({});
  const [pinDraft, setPinDraft] = useState<PinDraft | null>(null);
  const v = { ...dw, ...draft } as Diwaniya;
  const set = (p: Partial<DiwaniyaSettings>) => {
    setSavedNote('');
    setCheck('');
    setDraft((d) => ({ ...d, ...p }));
  };
  const pinSaved = pinOf(extra.data?.pin ?? null);
  const pinNow = pinDraft ?? pinSaved;
  const patch = settingsPatch(dw, draft);
  const pinChanged = pinDraft !== null && !samePin(pinDraft, pinSaved);
  const changes = Object.keys(patch).length + (pinChanged ? 1 : 0);
  const dirty = changes > 0;
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const stop = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', stop);
    return () => window.removeEventListener('beforeunload', stop);
  }, [dirty]);
  // While changes wait and the Save at the foot is out of sight, a small bar above the nav says so
  // and takes him there (the page keeps one Save; this only points at it).
  const saveBar = useRef<HTMLDivElement>(null);
  const [saveSeen, setSaveSeen] = useState(true);
  useEffect(() => {
    const el = saveBar.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setSaveSeen(e.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [host]);
  const discard = () => {
    setDraft({});
    setPinDraft(null);
    setCheck('');
  };
  const saveAll = () => {
    if (patch.name !== undefined && !patch.name.trim()) return setCheck(c.page.needName);
    if (patch.guest_cap !== undefined && (patch.guest_cap < 0 || patch.guest_cap > 30)) return setCheck(c.page.range(c.settings.guestCap, fmt(0), fmt(30)));
    if (patch.pin_unlock_minutes !== undefined && (patch.pin_unlock_minutes < 0 || patch.pin_unlock_minutes > 720)) return setCheck(c.page.range(c.settings.pinUnlock, fmt(0), fmt(720)));
    if (pinChanged && !pinDraft!.at) return setCheck(c.map.needPin);
    setCheck('');
    void saving.run(async () => {
      if (Object.keys(patch).length) await updateDiwaniya(dw.id, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
      if (pinChanged && pinDraft!.at) await setPin(dw.id, pinDraft!.at.lat, pinDraft!.at.lng, pinDraft!.directions.trim(), pinDraft!.address.trim().replace(/[\u0000-\u001f\u007f]/g, ' '));
      setDraft({});
      setPinDraft(null);
      setSavedNote(c.common.saved);
      extra.reload();
      onChanged();
    });
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

      {/* ---------- Tonight, with the settings at its top (ADC-LOG-794 item 3) ---------- */}
      <Part id="dw-tonight" icon={CalendarCheck} title={c.page.tonight} wide>
        <div className="edit-list dw-settings">
          <TextRow label={c.board.name} value={v.name} saved={dw.name} editable={host} max={60} required onChange={(x) => set({ name: x })} />
          <AreaRow value={v.area} editable={host} changed={v.area !== dw.area} onChange={(x) => set({ area: x })} />
          <TextRow label={c.settings.usualSlot} hint={c.settings.usualSlotHint} value={v.usual_slot} saved={dw.usual_slot} editable={host} max={40} onChange={(x) => set({ usual_slot: x })} />
          <SelectRow
            label={c.settings.visibility}
            value={v.visibility}
            changed={v.visibility !== dw.visibility}
            options={(['public', 'followers'] as const).map((x) => ({ value: x, label: c.settings.visibilityOpts[x] }))}
            editable={host}
            onChange={(x) => set({ visibility: x })}
          />
          <SelectRow
            label={c.settings.approval}
            value={v.approval}
            changed={v.approval !== dw.approval}
            options={(['host', 'regulars_auto'] as const).map((x) => ({ value: x, label: c.settings.approvalOpts[x] }))}
            editable={host}
            onChange={(x) => set({ approval: x })}
          />
          <NumberRow label={c.settings.guestCap} value={v.guest_cap} saved={dw.guest_cap} min={0} max={30} step={1} editable={host} onChange={(x) => set({ guest_cap: x })} />
          <SelectRow
            label={c.messages.setting}
            value={v.messages_on ? 'on' : 'off'}
            changed={v.messages_on !== dw.messages_on}
            options={(['on', 'off'] as const).map((x) => ({ value: x, label: c.messages.settingOpts[x] }))}
            editable={host}
            onChange={(x) => set({ messages_on: x === 'on' })}
          />
        </div>
        <div className="dw-night">
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
        </div>
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

      {/* ---------- About and rules ---------- */}
      <Part id="dw-rules" icon={Article} title={c.page.rules}>
        <div className="edit-list">
          <TextRow label={c.settings.about} value={v.about} saved={dw.about} editable={host} max={500} rows={3} onChange={(x) => set({ about: x })} />
          <TextRow label={c.settings.rules} value={v.rules} saved={dw.rules} editable={host} max={1000} rows={4} onChange={(x) => set({ rules: x })} />
        </div>
      </Part>

      {/* ---------- Location and address: last (ADC-LOG-794 item 3) ---------- */}
      <Part id="dw-location" icon={MapPin} title={c.page.location}>
        {extra.data ? (
          <Location
            pin={extra.data.pin}
            draft={pinNow}
            unlock={v.pin_unlock_minutes}
            savedUnlock={dw.pin_unlock_minutes}
            host={host}
            onPin={(p) => {
              setSavedNote('');
              setPinDraft(p);
            }}
            onUnlock={(x) => set({ pin_unlock_minutes: x })}
          />
        ) : (
          <Skeleton rows={1} />
        )}
      </Part>

      {/* ---------- One Save for the whole page ---------- */}
      {host && dirty && !saveSeen && createPortal(
        <button type="button" className="dw-unsaved" onClick={() => saveBar.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'end' })}>
          <span>{c.page.unsaved(changes, fmt)}</span>
          <span className="dw-unsaved__go">
            {c.page.toSave}
            <ArrowDown size={16} aria-hidden="true" />
          </span>
        </button>,
        document.body,
      )}
      {host && (
        <div ref={saveBar} className={dirty ? 'dw-save dw-save--dirty' : 'dw-save'} aria-live="polite">
          {saving.error != null && <ErrorNote text={err(saving.error)} />}
          {check && <ErrorNote text={check} />}
          {savedNote && !dirty && <OkNote text={savedNote} />}
          <p className="dw-save__state muted small">{dirty ? c.page.unsaved(changes, fmt) : c.page.allSaved}</p>
          <div className="dw-save__acts">
            {dirty && <CancelButton onClick={discard} label={c.page.discard} />}
            <button type="button" className="btn btn--primary" disabled={!dirty || saving.busy} onClick={saveAll}>
              <FloppyDisk size={18} aria-hidden="true" />
              {c.common.save}
            </button>
          </div>
        </div>
      )}
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
