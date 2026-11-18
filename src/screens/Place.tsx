import { useState } from 'react';
import { Flag, LockSimple, MapPin, Heart, ShieldCheck, Crown, ArrowSquareOut, ChatsCircle, X } from '@phosphor-icons/react';
import { PushBar, ErrorNote, OkNote, Sheet, Skeleton, Field } from '../components/ui';
import { NeedsAccount, TableRing } from '../components/account';
import { EmptyState } from '../components/EmptyState';
import { DallahArt } from '../components/Art';
import { MapView, googleMapsUrl } from '../components/Map';
import { areaLabel } from '../lib/areas';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import {
  cancelRequest,
  checkIn,
  getDiwaniya,
  getMyRequest,
  getOpenNight,
  getPin,
  isFollowing,
  joinQueue,
  leaveQueue,
  leaveSeat,
  openSeats,
  report,
  reportMessage,
  requestSeat,
  setFollow,
  type NightRow,
  type ReportReason,
  type RequestRow,
  type TableRow,
} from '../lib/api';
import { href, hrefFor } from '../lib/router';

const ETAS = [0, 15, 30, 45, 60, 90];

export function Place({ id }: { id: string }) {
  const { t } = usePrefs();
  return (
    <>
      <PushBar title={t.diwaniya.title} parent={hrefFor('tonight')} />
      <div className="screen__body">
        <NeedsAccount>
          <PlaceBody id={id} />
        </NeedsAccount>
      </div>
    </>
  );
}

function PlaceBody({ id }: { id: string }) {
  const { c, t, time, err, prefs } = usePrefs();
  const { userId } = useSession();
  const data = useAsync(
    async () => {
      const [dw, night, following] = await Promise.all([getDiwaniya(id), getOpenNight(id), isFollowing(id)]);
      const mine = night ? await getMyRequest(night.id) : null;
      return { dw, night, following, mine };
    },
    [id],
    ['nights', 'game_tables', 'seats', 'requests', 'table_queue'],
  );
  const act = useAction();
  const [sheet, setSheet] = useState<'request' | 'report' | null>(null);
  const [notice, setNotice] = useState('');

  if (data.loading && !data.data) return <Skeleton rows={2} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const { dw, night, following, mine } = data.data!;
  if (!dw) return <ErrorNote text={c.errors.notFound} />;

  const manager = dw.host_id === userId;
  const active = mine && ['pending', 'approved', 'arrived'].includes(mine.status) ? mine : null;
  const approved = active && (active.status === 'approved' || active.status === 'arrived');
  const seatedAt = night?.tables.find((tb) => tb.seats.some((s) => s.user_id === userId));

  const doAct = (fn: () => Promise<unknown>, ok?: string) =>
    void act.run(async () => {
      await fn();
      setNotice(ok ?? '');
      data.reload();
    });

  return (
    <div className="place">
      <section className="place__head" aria-labelledby="place-name">
        <h2 id="place-name" className="place__name">
          <bdi>{dw.name}</bdi>
        </h2>
        <p className="place__meta">
          <MapPin size={16} aria-hidden="true" /> <bdi>{areaLabel(dw.area, prefs.lang)}</bdi>
          {dw.usual_slot && <> · {c.place.usually(dw.usual_slot)}</>}
        </p>
        <p className="place__meta">
          <Crown size={16} aria-hidden="true" />{' '}
          <a className="link" href={href.player(dw.host_id)}>
            <bdi>{c.place.host(dw.host?.display_name ?? '')}</bdi>
          </a>
        </p>
        <div className="place__actions">
          {manager ? (
            <a className="btn btn--primary" href={href.diwaniya(dw.id)}>
              {c.place.manage}
            </a>
          ) : (
            <button
              type="button"
              className={following ? 'btn btn--camel' : 'btn btn--quiet'}
              aria-pressed={following}
              disabled={act.busy}
              onClick={() => doAct(() => setFollow(dw.id, !following))}
            >
              <Heart size={18} weight={following ? 'fill' : 'regular'} aria-hidden="true" />
              {following ? c.place.following : c.place.follow}
            </button>
          )}
          {!manager && dw.messages_on && (
            <a className="btn btn--quiet" href={href.dm(dw.id)}>
              <ChatsCircle size={18} aria-hidden="true" />
              {c.messages.toHost}
            </a>
          )}
        </div>
      </section>

      {act.error != null && <ErrorNote text={err(act.error)} />}
      {notice && <OkNote text={notice} />}

      {!night ? (
        <EmptyState art={<DallahArt />} title={c.place.closedTonight} body={c.place.closedBody} actions={[]} />
      ) : (
        <section aria-labelledby="tables-t" className="stack">
          <h2 id="tables-t" className="section-title">
            {c.place.tables} · <span className="muted">{c.tonight.starts(time(night.starts_at))}</span>
          </h2>
          {night.tables.length === 0 && <p className="muted">{t.diwaniya.emptyBody}</p>}
          <ul className="tables">
            {night.tables.map((tb) => (
              <TableBlock
                key={tb.id}
                table={tb}
                me={userId}
                canSit={!!approved || manager}
                seatedHere={seatedAt?.id === tb.id}
                seatedElsewhere={!!seatedAt && seatedAt.id !== tb.id}
                member={!!approved || manager}
                busy={act.busy}
                onSit={(n) => doAct(() => checkIn(tb.id, n))}
                onLeave={() => doAct(() => leaveSeat(tb.id))}
                onQueue={(on) => doAct(() => (on ? joinQueue(tb.id) : leaveQueue(tb.id)))}
              />
            ))}
          </ul>
        </section>
      )}

      {night && !manager && (
        <MyRequestCard
          night={night}
          request={active}
          busy={act.busy}
          onCancel={() => doAct(() => cancelRequest(active!.id))}
        />
      )}

      {night && (approved || manager) ? <PinCard diwaniyaId={dw.id} night={night} /> : (
        <p className="note note--quiet">
          <LockSimple size={18} aria-hidden="true" />
          <span>{c.place.areaOnly}</span>
        </p>
      )}

      {dw.about && (
        <section className="panel" aria-labelledby="about-t">
          <h2 id="about-t" className="panel__title">
            {c.place.about}
          </h2>
          <p className="prose">
            <bdi>{dw.about}</bdi>
          </p>
        </section>
      )}
      <section className="panel" aria-labelledby="rules-t">
        <h2 id="rules-t" className="panel__title">
          {c.place.rules}
        </h2>
        <p className="prose">{dw.rules ? <bdi>{dw.rules}</bdi> : c.place.noRules}</p>
      </section>
      <p className="note note--quiet">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>{c.place.safety}</span>
      </p>
      {!manager && (
        <button type="button" className="btn btn--text" onClick={() => setSheet('report')}>
          <Flag size={18} aria-hidden="true" />
          {c.place.report}
        </button>
      )}

      {night && !manager && !active && (
        <div className="sticky-cta">
          <button type="button" className="btn btn--primary btn--wide" onClick={() => setSheet('request')}>
            {c.place.request}
          </button>
        </div>
      )}

      {sheet === 'request' && night && (
        <RequestSheet
          night={night}
          onClose={() => setSheet(null)}
          onSent={(auto) => {
            setSheet(null);
            setNotice(auto ? c.requestSheet.autoApproved : c.requestSheet.sent);
            data.reload();
          }}
        />
      )}
      {sheet === 'report' && (
        <ReportSheet target={{ diwaniya: dw.id }} onClose={() => setSheet(null)} onSent={() => setNotice(c.report.sent)} />
      )}
    </div>
  );
}

function TableBlock(p: {
  table: TableRow;
  me: string | null;
  canSit: boolean;
  seatedHere: boolean;
  seatedElsewhere: boolean;
  member: boolean;
  busy: boolean;
  onSit: (seatNo: number) => void;
  onLeave: () => void;
  onQueue: (on: boolean) => void;
  /** Managers and guests checked in tonight score this table (ADC-LOG-754 item 4). */
}) {
  const { c, fmt } = usePrefs();
  const tb = p.table;
  const free = Array.from({ length: tb.seat_count }, (_, i) => i + 1).filter((n) => !tb.seats.some((s) => s.seat_no === n));
  const queued = tb.queue?.some((q) => q.user_id === p.me);
  return (
    <li className="table-block">
      <TableRing table={tb} size={112} />
      <div className="table-block__side">
        {p.seatedHere ? (
          <button type="button" className="btn btn--danger btn--small" disabled={p.busy} onClick={p.onLeave}>
            <X size={16} aria-hidden="true" />
            {c.place.leaveSeat}
          </button>
        ) : (
          p.canSit &&
          !p.seatedElsewhere &&
          free.length > 0 && (
            <div className="seat-pick" role="group" aria-label={c.place.pickSeat}>
              {free.map((n) => (
                <button key={n} type="button" className="seat-btn" disabled={p.busy} onClick={() => p.onSit(n)}>
                  {c.place.checkIn} {fmt(n)}
                </button>
              ))}
            </div>
          )
        )}
        <div className="queue">
          <p className="queue__title">
            {c.place.queue} · <span className="muted">{c.place.queueMode[tb.queue_mode]}</span>
          </p>
          {tb.queue && tb.queue.length > 0 ? (
            <ol className="queue__list">
              {[...tb.queue]
                .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
                .map((q) => (
                  <li key={q.user_id}>
                    <bdi>{q.profile?.display_name ?? '؟'}</bdi>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="muted small">{c.place.queueEmpty}</p>
          )}
          {p.member && !p.seatedHere && openSeats(tb) === 0 && (
            <button type="button" className={queued ? "btn btn--danger btn--small" : "btn btn--quiet btn--small"} disabled={p.busy} onClick={() => p.onQueue(!queued)}>
              {queued && <X size={16} aria-hidden="true" />}
              {queued ? c.place.leaveQueue : c.place.joinQueue}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function MyRequestCard({ night, request, busy, onCancel }: { night: NightRow; request: RequestRow | null; busy: boolean; onCancel: () => void }) {
  const { c, t } = usePrefs();
  if (!request) return null;
  const table = night.tables.find((x) => x.id === request.table_id);
  return (
    <section className="panel" aria-labelledby="myreq-t">
      <h2 id="myreq-t" className="panel__title">
        {c.place.yourRequest}
      </h2>
      <p className="status-row">
        <span key={request.status} className={`status status--${request.status}`}>
          {c.status[request.status]}
        </span>
        {table && <span className="muted">{t.games[table.game]}</span>}
      </p>
      {(request.status === 'pending' || request.status === 'approved') && (
        <button type="button" className="btn btn--danger btn--small" disabled={busy} onClick={onCancel}>
          <X size={16} aria-hidden="true" />
          {c.place.cancelRequest}
        </button>
      )}
    </section>
  );
}

function PinCard({ diwaniyaId, night }: { diwaniyaId: string; night: NightRow }) {
  const { c, time } = usePrefs();
  const pin = useAsync(() => getPin(diwaniyaId), [diwaniyaId, night.id]);
  if (pin.loading) return null;
  if (!pin.data) {
    return (
      <p className="note note--quiet">
        <LockSimple size={18} aria-hidden="true" />
        <span>{night.pin_unlock_at ? c.place.pinLocked(time(night.pin_unlock_at)) : c.place.areaOnly}</span>
      </p>
    );
  }
  const at = { lat: Number(pin.data.lat), lng: Number(pin.data.lng) };
  return (
    <section className="panel pin-card" aria-labelledby="pin-t">
      <h2 id="pin-t" className="panel__title">
        <MapPin size={18} weight="fill" aria-hidden="true" /> {c.place.pinTitle}
      </h2>
      {pin.data.address && (
        <p className="pin-card__address">
          <span className="muted small">{c.settings.address}</span>
          <bdi>{pin.data.address}</bdi>
        </p>
      )}
      <MapView at={at} />
      {pin.data.directions && (
        <p className="prose">
          <bdi>{pin.data.directions}</bdi>
        </p>
      )}
      <a className="btn btn--primary" href={googleMapsUrl(at)} target="_blank" rel="noopener noreferrer">
        <ArrowSquareOut size={18} aria-hidden="true" />
        {c.place.openMaps}
      </a>
    </section>
  );
}

export function RequestSheet({ night, onClose, onSent }: { night: NightRow; onClose: () => void; onSent: (auto: boolean) => void }) {
  const { c, t, fmt, err } = usePrefs();
  const act = useAction();
  const [table, setTable] = useState<string>('');
  const [eta, setEta] = useState(30);
  const [note, setNote] = useState('');
  const [accept, setAccept] = useState(false);
  return (
    <Sheet title={c.requestSheet.title} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            const reqId = await requestSeat(night.id, table || null, eta, note, accept);
            const mine = await getMyRequest(night.id);
            onSent(mine?.id === reqId && mine.status === 'approved');
          });
        }}
      >
        <Field label={c.requestSheet.table}>
          <select className="input" value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">{c.requestSheet.anyTable}</option>
            {night.tables.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {t.games[tb.game]}
                {tb.label ? ` · ${tb.label}` : ''} · {t.seatsOpen(openSeats(tb), fmt)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="field">
          <legend className="field__label">{c.requestSheet.eta}</legend>
          <div className="segmented">
            {ETAS.map((m) => (
              <label key={m} className="segmented__opt">
                <input type="radio" name="eta" checked={eta === m} onChange={() => setEta(m)} />
                <span>{c.common.minutes(m, fmt)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={c.requestSheet.note}>
          <textarea className="input" rows={2} maxLength={200} placeholder={c.requestSheet.notePlaceholder} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="note note--quiet small">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{c.place.safety}</span>
        </p>
        <label className="check">
          <input type="checkbox" required checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>{c.requestSheet.accept}</span>
        </label>
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary btn--wide" disabled={act.busy || !accept}>
          {c.requestSheet.send}
        </button>
      </form>
    </Sheet>
  );
}

const REASONS: ReportReason[] = ['safety', 'harassment', 'no_show', 'fake', 'other'];

export function ReportSheet({
  target,
  onClose,
  onSent,
  title,
  quote,
}: {
  target: { user?: string; diwaniya?: string; message?: string };
  onClose: () => void;
  onSent: () => void;
  title?: string;
  /** The reported words, shown back so the reporter knows what he is sending. */
  quote?: string;
}) {
  const { c, err } = usePrefs();
  const act = useAction();
  const [reason, setReason] = useState<ReportReason>(target.message ? 'harassment' : 'safety');
  const [details, setDetails] = useState('');
  return (
    <Sheet title={title ?? c.report.title} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            if (target.message) await reportMessage(target.message, reason, details);
            else await report(target, reason, details);
            onSent();
            onClose();
          });
        }}
      >
        {quote && (
          <blockquote className="report__quote">
            <bdi>{quote}</bdi>
          </blockquote>
        )}
        <Field label={c.report.reason}>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {c.report.reasons[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.report.details}>
          <textarea className="input" rows={4} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary btn--wide" disabled={act.busy}>
          {c.report.send}
        </button>
      </form>
    </Sheet>
  );
}
