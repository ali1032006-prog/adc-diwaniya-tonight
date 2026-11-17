import { useEffect, useState } from 'react';
import { Gear, Lightning, Trash, UserPlus, Star, ChartBar, Plus } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { SeatRing } from '../components/SeatRing';
import { NeedsAccount, TableRing } from '../components/account';
import { ErrorNote, Field, OkNote, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useAction, useAsync } from '../lib/useAsync';
import {
  GAMES,
  addRegular,
  addTable,
  checkIn,
  clearSeat,
  closeNight,
  createDiwaniya,
  decideRequest,
  getOpenNight,
  listFollowed,
  listRequests,
  markRequest,
  myDiwaniyas,
  openNight,
  openSeats,
  removeTable,
  seatWalkIn,
  setNeedOne,
  setQueueMode,
  type Diwaniya,
  type Game,
  type NightRow,
  type RequestRow,
  type TableRow,
} from '../lib/api';
import { href } from '../lib/router';

const PICKED = 'dt.board.v1';

/** The start time typed on the board, as an instant in Kuwait time: today, or tomorrow if that hour is long gone. */
export function kuwaitStart(hhmm: string, now = new Date()): Date {
  const kw = new Date(now.getTime() + 3 * 3600_000);
  const day = kw.toISOString().slice(0, 10);
  let at = new Date(`${day}T${hhmm}:00+03:00`);
  if (at.getTime() < now.getTime() - 3 * 3600_000) at = new Date(at.getTime() + 24 * 3600_000);
  return at;
}

/** S8 Diwaniya tab: hosts run tonight here; everyone sees the diwaniyas they follow. */
export function Board() {
  const { t } = usePrefs();
  return (
    <Screen title={t.diwaniya.title}>
      <NeedsAccount>
        <BoardBody />
      </NeedsAccount>
    </Screen>
  );
}

function BoardBody() {
  const { err } = usePrefs();
  const mine = useAsync(myDiwaniyas, []);
  const [picked, setPicked] = useState(() => localStorage.getItem(PICKED) ?? '');
  useEffect(() => {
    if (picked) localStorage.setItem(PICKED, picked);
  }, [picked]);

  if (mine.loading && !mine.data) return <Skeleton rows={2} />;
  if (mine.error != null && !mine.data) return <ErrorNote text={err(mine.error)} onRetry={mine.reload} />;
  const list = mine.data ?? [];
  const current = list.find((d) => d.id === picked) ?? list[0];
  return (
    <>
      {current ? (
        <HostBoard dw={current} all={list} onPick={setPicked} />
      ) : (
        <CreateDiwaniya onCreated={(id) => {
          setPicked(id);
          mine.reload();
        }} />
      )}
      <Followed />
    </>
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
          void act.run(async () => onCreated((await createDiwaniya(name.trim(), area.trim())).id));
        }}
      >
        <Field label={c.board.name}>
          <input className="input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={c.profile.area} hint={c.profile.areaHint}>
          <input className="input" required maxLength={60} value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary" disabled={act.busy}>
          {c.board.create}
        </button>
      </form>
    </section>
  );
}

function HostBoard({ dw, all, onPick }: { dw: Diwaniya; all: Diwaniya[]; onPick: (id: string) => void }) {
  const { c, time, err, fmt } = usePrefs();
  const night = useAsync(() => getOpenNight(dw.id), [dw.id], ['nights', 'game_tables', 'seats', 'table_queue']);
  const act = useAction();
  const [notice, setNotice] = useState('');
  const [startAt, setStartAt] = useState('21:00');
  const run = (fn: () => Promise<unknown>, ok = '') =>
    void act.run(async () => {
      await fn();
      setNotice(ok);
      night.reload();
    });

  return (
    <>
      <section className="board-head" aria-labelledby="board-t">
        {all.length > 1 ? (
          <Field label={c.board.pick}>
            <select className="input" value={dw.id} onChange={(e) => onPick(e.target.value)}>
              {all.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <h2 id="board-t" className="place__name">
          <a className="link-quiet" href={href.place(dw.id)}>
            <bdi>{dw.name}</bdi>
          </a>
        </h2>
        <div className="board-head__links">
          <a className="btn btn--quiet btn--small" href={href.settings(dw.id)}>
            <Gear size={18} aria-hidden="true" />
            {c.board.settings}
          </a>
          <a className="btn btn--quiet btn--small" href={href.score(dw.id)}>
            <ChartBar size={18} aria-hidden="true" />
            {c.board.score}
          </a>
        </div>
      </section>

      {act.error != null && <ErrorNote text={err(act.error)} />}
      {notice && <OkNote text={notice} />}

      {night.loading && !night.data ? (
        <Skeleton rows={1} />
      ) : night.error != null && night.data === undefined ? (
        <ErrorNote text={err(night.error)} onRetry={night.reload} />
      ) : !night.data ? (
        <section className="panel" aria-labelledby="open-t">
          <h2 id="open-t" className="panel__title panel__title--ink">
            {c.board.openTonight}
          </h2>
          <p className="muted">{c.board.quiet}</p>
          <form
            className="form form--row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => openNight(dw.id, kuwaitStart(startAt)));
            }}
          >
            <Field label={c.board.startsAt}>
              <input className="input input--time" type="time" required value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </Field>
            <button className="btn btn--primary" disabled={act.busy}>
              {c.board.openTonight}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="panel" aria-labelledby="night-t">
            <h2 id="night-t" className="panel__title panel__title--ink">
              {c.board.nightOpen(time(night.data.starts_at))}
            </h2>
            <div className="row">
              <button
                type="button"
                className="btn btn--quiet btn--small"
                disabled={act.busy}
                onClick={() => window.confirm(c.board.closeConfirm) && run(() => closeNight(night.data!.id))}
              >
                {c.board.closeNight}
              </button>
            </div>
          </section>
          <ul className="tables">
            {night.data.tables.map((tb) => (
              <BoardTable
                key={tb.id}
                dw={dw}
                table={tb}
                busy={act.busy}
                run={run}
                onPinged={(n) => setNotice(c.board.pinged(n, fmt))}
              />
            ))}
          </ul>
          <AddTable nightId={night.data.id} busy={act.busy} run={run} />
          <Requests dw={dw} night={night.data} />
        </>
      )}
    </>
  );
}

function BoardTable({
  dw,
  table,
  busy,
  run,
  onPinged,
}: {
  dw: Diwaniya;
  table: TableRow;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => void;
  onPinged: (n: number) => void;
}) {
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
              className="form form--row"
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
                  <button
                    type="button"
                    className="icon-btn icon-btn--small"
                    aria-label={`${c.board.clearSeat} ${fmt(s.seat_no)}`}
                    disabled={busy}
                    onClick={() => run(() => clearSeat(table.id, s.seat_no))}
                  >
                    <Trash size={18} aria-hidden="true" />
                  </button>
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
        <div className="row">
          <a className="btn btn--quiet btn--small" href={href.score(dw.id, table.id)}>
            {c.board.score}
          </a>
          <button type="button" className="btn btn--text btn--small" disabled={busy} onClick={() => run(() => removeTable(table.id))}>
            {c.board.removeTable} ({t.games[table.game]})
          </button>
        </div>
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
    <section className="panel" aria-labelledby="add-t">
      <h2 id="add-t" className="panel__title">
        {c.board.addTable}
      </h2>
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
    </section>
  );
}

const ORDER: Record<RequestRow['status'], number> = { pending: 0, approved: 1, arrived: 2, no_show: 3, declined: 4, cancelled: 5 };

function Requests({ dw, night }: { dw: Diwaniya; night: NightRow }) {
  const { c, fmt, err } = usePrefs();
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
    <section className="panel" aria-labelledby="req-t" aria-live="polite">
      <h2 id="req-t" className="panel__title">
        {c.board.requests}
      </h2>
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
                <bdi>{r.user?.area}</bdi> · {c.board.eta(c.common.minutes(r.eta_minutes, fmt))}
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
                  <button type="button" className="btn btn--quiet btn--small" disabled={act.busy} onClick={() => run(() => decideRequest(r.id, false))}>
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
    </section>
  );
}

function Followed() {
  const { c, err } = usePrefs();
  const list = useAsync(listFollowed, []);
  return (
    <section className="panel" aria-labelledby="followed-t">
      <h2 id="followed-t" className="panel__title">
        {c.board.followed}
      </h2>
      {list.error != null && <ErrorNote text={err(list.error)} onRetry={list.reload} />}
      {list.data && list.data.length === 0 && <p className="muted">{c.board.noFollowed}</p>}
      <ul className="link-list">
        {(list.data ?? []).map((d) => (
          <li key={d.id}>
            <a className="link-row" href={href.place(d.id)}>
              <bdi>{d.name}</bdi>
              <span className="muted small">
                <bdi>{d.area}</bdi>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
