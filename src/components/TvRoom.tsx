// The host's side of "Diwaniya on the TV" (ADC-RES-54, Ali's approval ADC-LOG-817, without the empty-seat code):
// Show on TV (room code + link, new code, stop), Tonight's draw, and the Night card.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Television, Shuffle, ImageSquare, Copy as CopyIcon, ArrowsClockwise, Stop, ShareNetwork, DownloadSimple, Plus, Check } from '@phosphor-icons/react';
import { ErrorNote, Field, OkNote, Sheet, Skeleton } from './ui';
import { usePrefs } from '../lib/prefs';
import { useAction, useAsync } from '../lib/useAsync';
import { areaLabel } from '../lib/areas';
import { listRequests, nightCard, tvCurrent, tvDraw, tvNewCode, tvOpen, tvRevoke, type Draw, type NightRow, type RequestRow } from '../lib/api';
import { cardText, drawNightCard, saveBlob, shareOrSave } from '../lib/nightCard';

/** Address of the TV page on this site; the code rides after the # so it never reaches a server log. */
export function tvLink(code?: string): string {
  return `${window.location.origin}/tv${code ? `#${code}` : ''}`;
}

/** Names for the draw: everyone in a seat tonight, then everyone marked arrived, no repeats. */
export function drawCandidates(night: NightRow, requests: RequestRow[] = []): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (n: string | null | undefined) => {
    const v = (n ?? '').trim().replace(/\s+/g, ' ');
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  };
  for (const t of night.tables) for (const s of [...t.seats].sort((a, b) => a.seat_no - b.seat_no)) add(s.walk_in_name ?? s.profile?.display_name);
  for (const r of requests) if (r.status === 'arrived') add(r.user?.display_name);
  return out;
}

type Open = null | 'tv' | 'draw' | 'card';

/** On the Diwaniya page, under tonight's state: the three room-screen actions. */
export function TvPanel({ night, diwaniyaId }: { night: NightRow; diwaniyaId: string }) {
  const { c } = usePrefs();
  const [open, setOpen] = useState<Open>(null);
  const room = useAsync(() => tvCurrent(night.id), [night.id]);
  return (
    <div className="tvroom" aria-labelledby="tvroom-t">
      <h3 id="tvroom-t" className="setting__label">
        <Television size={16} aria-hidden="true" /> {c.tvroom.title}
        {room.data && <span className="tag tag--saffron tvroom__on">{c.tvroom.onNow}</span>}
      </h3>
      <p className="muted small">{c.tvroom.body}</p>
      <div className="tvroom__acts">
        <button type="button" className="btn btn--primary" onClick={() => setOpen('tv')}>
          <Television size={18} aria-hidden="true" />
          {c.tvroom.show}
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => setOpen('draw')}>
          <Shuffle size={18} aria-hidden="true" />
          {c.tvroom.draw}
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => setOpen('card')}>
          <ImageSquare size={18} aria-hidden="true" />
          {c.tvroom.card}
        </button>
      </div>
      {open === 'tv' && <ShowOnTv nightId={night.id} onClose={() => (setOpen(null), room.reload())} />}
      {open === 'draw' && <DrawSheet night={night} onTv={!!room.data} onClose={() => setOpen(null)} />}
      {open === 'card' && <CardSheet diwaniyaId={diwaniyaId} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ShowOnTv({ nightId, onClose }: { nightId: string; onClose: () => void }) {
  const { c, err, time } = usePrefs();
  const room = useAsync(() => tvCurrent(nightId), [nightId]);
  const act = useAction();
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<{ code: string; expires_at: string } | null | undefined>(undefined);
  const r = current === undefined ? room.data : current;
  const run = (fn: () => Promise<{ code: string; expires_at: string } | null>, ok = '') =>
    void act.run(async () => {
      setNote('');
      setCurrent(await fn());
      setNote(ok);
    });
  return (
    <Sheet title={c.tvroom.show} onClose={onClose}>
      <p className="muted">{c.tvroom.sheetBody}</p>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {note && <OkNote text={note} />}
      {room.loading && current === undefined ? (
        <Skeleton rows={2} />
      ) : room.error != null && current === undefined ? (
        <ErrorNote text={err(room.error)} onRetry={room.reload} />
      ) : r ? (
        <div className="tvcode">
          <dl className="tvcode__facts">
            <div>
              <dt>{c.tvroom.link}</dt>
              <dd dir="ltr" className="tvcode__link">
                {tvLink().replace(/^https?:\/\//, '')}
              </dd>
            </div>
            <div>
              <dt>{c.tvroom.code}</dt>
              <dd dir="ltr" className="tvcode__code" aria-label={r.code.split('').join(' ')}>
                {r.code}
              </dd>
            </div>
          </dl>
          <p className="muted small">{c.tvroom.until(time(r.expires_at))}</p>
          <div className="tvcode__acts">
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(tvLink(r.code))
                  .then(() => setNote(c.tvroom.copied))
                  .catch(() => {})
              }
            >
              <CopyIcon size={18} aria-hidden="true" />
              {c.tvroom.copy}
            </button>
            <button type="button" className="btn btn--quiet" disabled={act.busy} onClick={() => run(() => tvNewCode(nightId))} aria-describedby="tv-newcode-hint">
              <ArrowsClockwise size={18} aria-hidden="true" />
              {c.tvroom.newCode}
            </button>
            <button type="button" className="btn btn--danger" disabled={act.busy} onClick={() => run(async () => (await tvRevoke(nightId), null), c.tvroom.stopped)}>
              <Stop size={18} aria-hidden="true" />
              {c.tvroom.stop}
            </button>
          </div>
          <p id="tv-newcode-hint" className="muted small">
            {c.tvroom.newCodeHint}
          </p>
        </div>
      ) : (
        <button type="button" className="btn btn--primary btn--block" disabled={act.busy} onClick={() => run(() => tvOpen(nightId))}>
          <Television size={18} aria-hidden="true" />
          {c.tvroom.open}
        </button>
      )}
    </Sheet>
  );
}

function DrawSheet({ night, onTv, onClose }: { night: NightRow; onTv: boolean; onClose: () => void }) {
  const { c, err, fmt } = usePrefs();
  const [names, setNames] = useState<string[]>(() => drawCandidates(night));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(drawCandidates(night)));
  // people marked arrived join the list (ticked) once the requests load
  const reqs = useAsync(() => listRequests(night.id), [night.id]);
  const merged = useRef(false);
  useEffect(() => {
    if (!reqs.data || merged.current) return;
    merged.current = true;
    const more = drawCandidates(night, reqs.data).filter((n) => !names.some((x) => x.toLowerCase() === n.toLowerCase()));
    if (more.length) {
      setNames((x) => [...x, ...more]);
      setPicked((p) => new Set([...p, ...more]));
    }
  }, [reqs.data, night, names]);
  const [extra, setExtra] = useState('');
  const [result, setResult] = useState<Draw | null>(null);
  const act = useAction();
  const chosen = names.filter((n) => picked.has(n));
  const add = () => {
    const v = extra.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!v) return;
    if (!names.some((n) => n.toLowerCase() === v.toLowerCase())) setNames((x) => [...x, v]);
    setPicked((p) => new Set(p).add(names.find((n) => n.toLowerCase() === v.toLowerCase()) ?? v));
    setExtra('');
  };
  return (
    <Sheet title={c.tvroom.draw} onClose={onClose}>
      <p className="muted">{c.tvroom.drawBody}</p>
      {names.length === 0 && <p className="muted small">{c.tvroom.drawNoPeople}</p>}
      {names.length > 0 && (
        <fieldset className="draw-pick">
          <legend className="setting__label">{c.tvroom.drawWho(chosen.length, fmt)}</legend>
          <ul className="draw-pick__list">
            {names.map((n) => (
              <li key={n}>
                <label className="draw-pick__item">
                  <input
                    type="checkbox"
                    checked={picked.has(n)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const next = new Set(p);
                        if (e.target.checked) next.add(n);
                        else next.delete(n);
                        return next;
                      })
                    }
                  />
                  <span className="draw-pick__box" aria-hidden="true">
                    <Check size={14} weight="bold" />
                  </span>
                  <bdi>{n}</bdi>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <form
        className="form form--row draw-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label={c.tvroom.drawAdd}>
          <input className="input" value={extra} maxLength={40} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <button className="btn btn--quiet" disabled={!extra.trim()}>
          <Plus size={18} aria-hidden="true" />
          {c.tvroom.drawAddBtn}
        </button>
      </form>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={act.busy || chosen.length < 2}
        aria-describedby={chosen.length < 2 ? 'draw-need' : undefined}
        onClick={() => void act.run(async () => setResult(await tvDraw(night.id, chosen)))}
      >
        <Shuffle size={18} aria-hidden="true" />
        {result ? c.tvroom.drawAgain : c.tvroom.drawGo}
      </button>
      {chosen.length < 2 && (
        <p id="draw-need" className="muted small">
          {c.tvroom.drawNeed}
        </p>
      )}
      {result && (
        <section className="draw-result" aria-live="polite" aria-labelledby="draw-result-t">
          <h3 id="draw-result-t" className="setting__label">
            {c.tvroom.drawNo(result.no, fmt)}
            {onTv && <span className="muted small"> · {c.tvroom.drawOnTv}</span>}
          </h3>
          <DrawResult key={result.no} draw={result} />
        </section>
      )}
    </Sheet>
  );
}

/** The draw on the phone: names land seat by seat (all at once with reduced motion). */
export function DrawResult({ draw }: { draw: Draw }) {
  const { c, t, fmt } = usePrefs();
  let i = 0;
  const step = () => ({ '--i': i++ }) as CSSProperties;
  return (
    <div className="draw">
      {draw.tables.map((tb, k) => (
        <div key={k} className="draw__table">
          <p className="draw__label">
            <bdi>{c.tvroom.tableN(tb.label, k, fmt)}</bdi>
            {tb.game && <span className="tag">{t.games[tb.game]}</span>}
          </p>
          <ol className="draw__seats">
            {tb.seats.map((s) => (
              <li key={s.seat} className={`draw__seat draw__seat--t${Math.min(s.team, 4)}`} style={step()}>
                <span className="draw__team">{c.score.team(s.team, fmt)}</span>
                <bdi>{s.name}</bdi>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {draw.waiting.length > 0 && (
        <div className="draw__table">
          <p className="draw__label">{c.tvroom.waiting}</p>
          <ol className="draw__seats">
            {draw.waiting.map((n, k) => (
              <li key={`${n}-${k}`} className="draw__seat draw__seat--wait" style={step()}>
                <bdi>{n}</bdi>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** The Night card button for people who were there (the Diwaniya page shows it to guests). */
export function NightCardButton({ diwaniyaId }: { diwaniyaId: string }) {
  const { c } = usePrefs();
  const card = useAsync(() => nightCard(diwaniyaId), [diwaniyaId]);
  const [open, setOpen] = useState(false);
  if (!card.data) return null;
  return (
    <>
      <button type="button" className="btn btn--quiet" onClick={() => setOpen(true)}>
        <ImageSquare size={18} aria-hidden="true" />
        {c.tvroom.card}
      </button>
      {open && <CardSheet diwaniyaId={diwaniyaId} onClose={() => setOpen(false)} />}
    </>
  );
}

function CardSheet({ diwaniyaId, onClose }: { diwaniyaId: string; onClose: () => void }) {
  const { c, fmt, err, prefs } = usePrefs();
  const img = useAsync(async () => {
    const card = await nightCard(diwaniyaId);
    if (!card) return null;
    const text = cardText(card, c, fmt, prefs.lang, areaLabel(card.area, prefs.lang), c.score.packs);
    const blob = await drawNightCard(text);
    return { blob, url: URL.createObjectURL(blob), name: card.name };
  }, [diwaniyaId, prefs.lang]);
  const [note, setNote] = useState('');
  const act = useAction();
  const file = c.tvroom.cardFile;
  return (
    <Sheet
      title={c.tvroom.card}
      onClose={() => {
        if (img.data) URL.revokeObjectURL(img.data.url);
        onClose();
      }}
    >
      <p className="muted">{c.tvroom.cardBody}</p>
      {img.loading && !img.data ? (
        <p className="muted" role="status">
          {c.tvroom.cardMaking}
        </p>
      ) : img.error != null || !img.data ? (
        <ErrorNote text={img.error != null && !(img.error instanceof Error && img.error.message === 'no canvas') ? err(img.error) : c.tvroom.cardFail} onRetry={img.reload} />
      ) : (
        <>
          <img className="nightcard" src={img.data.url} alt={c.tvroom.cardAlt(img.data.name)} width={1080} height={1350} />
          {act.error != null && <ErrorNote text={c.tvroom.cardFail} />}
          {note && <OkNote text={note} />}
          <div className="nightcard__acts">
            <button type="button" className="btn btn--primary" disabled={act.busy} onClick={() => void act.run(async () => {
              const r = await shareOrSave(img.data!.blob, file, img.data!.name);
              setNote(r === 'saved' ? c.common.saved : '');
            })}>
              <ShareNetwork size={18} aria-hidden="true" />
              {c.tvroom.cardShare}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => saveBlob(img.data!.blob, `${file}.png`)}>
              <DownloadSimple size={18} aria-hidden="true" />
              {c.tvroom.cardSave}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
