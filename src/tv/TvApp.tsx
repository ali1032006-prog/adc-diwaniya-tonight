import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { WovenBand } from '../components/WovenBand';
import { areaLabel } from '../lib/areas';
import type { Draw } from '../lib/api';
import { TV_COPY, type TvCopy } from './copy';
import {
  TvError,
  fetchTvState,
  freshDraw,
  isCode,
  listenTv,
  normalizeCode,
  pollEvery,
  revealOrder,
  type TvBoard,
  type TvLive,
  type TvState,
} from './state';

const LANG = 'dt.tv.lang';
const CODE = 'dt.tv.code';
type Lang = 'ar' | 'en';

function savedLang(): Lang {
  try {
    return localStorage.getItem(LANG) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}
function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: the TV just asks again */
  }
}
/** A code in the address (#K7P2QX) wins, then the one this TV used last. */
function startCode(): string {
  const fromHash = normalizeCode(window.location.hash.replace(/^#/, ''));
  if (isCode(fromHash)) return fromHash;
  try {
    const s = localStorage.getItem(CODE) ?? '';
    return isCode(s) ? s : '';
  } catch {
    return '';
  }
}
const nf = (n: number) => new Intl.NumberFormat('en-US').format(n);
const kuwaitTime = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuwait' }).format(new Date(iso));

type Phase =
  | { kind: 'enter'; note?: 'unknown' | 'ended' | 'limit' | 'offline' }
  | { kind: 'checking' }
  | { kind: 'board'; board: TvBoard; offline: boolean };

/** The diwaniya's TV: a room code in, the room's scoreboard out. Never signs in. */
export function TvApp() {
  const [lang, setLang] = useState<Lang>(savedLang);
  const t = TV_COPY[lang];
  const [code, setCode] = useState(startCode);
  const [phase, setPhase] = useState<Phase>(() => (code ? { kind: 'checking' } : { kind: 'enter' }));
  const [realtime, setRealtime] = useState(false);
  const [drawSeen, setDrawSeen] = useState(0);
  const [showDraw, setShowDraw] = useState<Draw | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const backoff = useRef(0);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    store(LANG, lang);
  }, [lang, t.dir]);

  const leave = useCallback((note?: 'unknown' | 'ended' | 'limit' | 'offline') => {
    store(CODE, null);
    setCode('');
    setPhase({ kind: 'enter', note });
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, []);

  const load = useCallback(async () => {
    if (!code) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const s: TvState = await fetchTvState(code);
      backoff.current = 0;
      if (s.status === 'live') {
        store(CODE, code);
        setPhase({ kind: 'board', board: s, offline: false });
      } else leave(s.status);
    } catch (e) {
      if (e instanceof TvError && e.kind === 'limit') {
        // A room read too often waits a minute; a code typed wrong too often goes back to the keypad.
        setPhase((p) => (p.kind === 'board' ? p : { kind: 'enter', note: 'limit' }));
        backoff.current = 60_000;
      } else {
        setPhase((p) => (p.kind === 'board' ? { ...p, offline: true } : p.kind === 'checking' ? { kind: 'enter', note: 'offline' } : p));
        backoff.current = Math.min(60_000, (backoff.current || 2_500) * 2);
      }
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void load();
      }
    }
  }, [code, leave]);

  // first read, then polling (fast while the broadcast is down, slow as a safety net while it is up)
  useEffect(() => {
    if (!code) return;
    void load();
    let timer = 0;
    const tick = () => {
      timer = window.setTimeout(
        () => {
          void load();
          tick();
        },
        Math.max(pollEvery(realtime), backoff.current),
      );
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [code, realtime, load]);

  // the broadcast: a ping carries no data, it only says "read again"
  const topic = phase.kind === 'board' ? phase.board.topic : '';
  useEffect(() => {
    if (!topic) return;
    let debounce = 0;
    const off = listenTv(
      topic,
      (ended) => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => void load(), ended ? 0 : 400);
      },
      setRealtime,
    );
    return () => {
      window.clearTimeout(debounce);
      off();
      setRealtime(false);
    };
  }, [topic, load]);

  // a fresh draw takes over the screen once, for 40 seconds or until a key or tap
  const draw = phase.kind === 'board' ? phase.board.draw : null;
  useEffect(() => {
    if (draw && freshDraw(draw, drawSeen)) {
      setDrawSeen(draw.no);
      setShowDraw(draw);
    } else if (draw && draw.no > drawSeen) setDrawSeen(draw.no);
  }, [draw, drawSeen]);
  useEffect(() => {
    if (!showDraw) return;
    const close = () => setShowDraw(null);
    const timer = window.setTimeout(close, 40_000);
    window.addEventListener('keydown', close);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', close);
    };
  }, [showDraw]);

  useWakeLock(phase.kind === 'board');
  const idle = useIdleCursor();

  const switchLang = () => setLang((l) => (l === 'ar' ? 'en' : 'ar'));
  return (
    <div className={`tv${idle ? ' tv--idle' : ''}`}>
      <WovenBand className="tv__band" />
      {phase.kind === 'board' ? (
        <>
          <Board t={t} lang={lang} board={phase.board} offline={phase.offline} realtime={realtime} onLang={switchLang} onExit={() => leave()} />
          {showDraw && <DrawReveal t={t} draw={showDraw} onClose={() => setShowDraw(null)} />}
        </>
      ) : (
        <Enter
          t={t}
          checking={phase.kind === 'checking'}
          note={phase.kind === 'enter' ? phase.note : undefined}
          onLang={switchLang}
          onCode={(c) => {
            setCode(c);
            setPhase({ kind: 'checking' });
          }}
        />
      )}
    </div>
  );
}

function Enter({ t, checking, note, onLang, onCode }: { t: TvCopy; checking: boolean; note?: 'unknown' | 'ended' | 'limit' | 'offline'; onLang: () => void; onCode: (c: string) => void }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const code = normalizeCode(value);
  return (
    <main className="tv-enter">
      <div className="tv-enter__top">
        <span className="tv-brand">{t.brand}</span>
        <button type="button" className="tv-btn tv-btn--quiet" onClick={onLang} lang={t.dir === 'rtl' ? 'en' : 'ar'}>
          {t.language}
        </button>
      </div>
      <form
        className="tv-enter__card"
        onSubmit={(e) => {
          e.preventDefault();
          if (isCode(code)) onCode(code);
        }}
      >
        <TvMark />
        <h1 className="tv-enter__title">{t.enterTitle}</h1>
        <p className="tv-enter__body">{t.enterBody}</p>
        <label className="tv-code">
          <span className="tv-code__label">{t.codeLabel}</span>
          <input
            ref={input}
            className="tv-code__input"
            value={value}
            onChange={(e) => setValue(normalizeCode(e.target.value))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={7}
            dir="ltr"
            aria-describedby={note ? 'tv-note' : undefined}
            aria-invalid={note === 'unknown' || undefined}
          />
        </label>
        {note && (
          <p id="tv-note" className="tv-note" role="alert">
            {t[note]}
          </p>
        )}
        <button className="tv-btn tv-btn--primary" disabled={!isCode(code) || checking}>
          {checking ? t.checking : t.show}
        </button>
      </form>
    </main>
  );
}

function Board({ t, lang, board, offline, realtime, onLang, onExit }: { t: TvCopy; lang: Lang; board: TvBoard; offline: boolean; realtime: boolean; onLang: () => void; onExit: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const live = board.live;
  return (
    <main className="tv-board">
      <header className="tv-head">
        <div className="tv-head__name">
          <h1 className="tv-head__title">
            <bdi>{board.diwaniya.name}</bdi>
          </h1>
          <p className="tv-head__meta">
            <bdi>{areaLabel(board.diwaniya.area, lang)}</bdi> · {t.starts(kuwaitTime(board.night.starts_at, lang))} · {t.tonight(board.tonight.games)}
          </p>
        </div>
        <div className="tv-head__side">
          <span className={offline ? 'tv-live tv-live--off' : 'tv-live'} role="status">
            <span className="tv-live__dot" aria-hidden="true" />
            {offline ? t.offline : realtime ? t.live : t.catchingUp}
          </span>
          <time className="tv-clock" dateTime={now.toISOString()}>
            {kuwaitTime(now.toISOString(), lang)}
          </time>
          <div className="tv-head__acts">
            <button type="button" className="tv-btn tv-btn--quiet" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}>
              {t.fullscreen}
            </button>
            <button type="button" className="tv-btn tv-btn--quiet" onClick={onLang} lang={lang === 'ar' ? 'en' : 'ar'}>
              {t.language}
            </button>
            <button type="button" className="tv-btn tv-btn--quiet" onClick={onExit}>
              {t.stop}
            </button>
          </div>
        </div>
      </header>

      <div className="tv-grid">
        <section className="tv-main" aria-label={t.live}>
          {live.length > 0 ? (
            <div className={`tv-games tv-games--${Math.min(live.length, 4)}`}>
              {live.map((g, i) => (
                <LiveGame key={`${g.table}-${i}`} t={t} g={g} big={live.length === 1} />
              ))}
            </div>
          ) : (
            <div className="tv-quiet">
              <h2 className="tv-quiet__title">{t.noLive}</h2>
              <p className="tv-quiet__body">{t.noLiveBody}</p>
            </div>
          )}
          <Tables t={t} board={board} />
        </section>

        <aside className="tv-side">
          <Crown t={t} names={board.crown} />
          <Season t={t} rows={board.season} />
          <Last t={t} board={board} />
          {board.draw && Date.now() - new Date(board.draw.at).getTime() < 90 * 60_000 && <DrawSummary t={t} draw={board.draw} />}
        </aside>
      </div>
    </main>
  );
}

/** One game being scored: the two (or four) team totals in big numbers, who plays, the rivalry. */
function LiveGame({ t, g, big }: { t: TvCopy; g: TvLive; big: boolean }) {
  const lead = Math.max(...g.totals);
  const leaders = g.totals.filter((x) => x === lead).length;
  return (
    <article className={big ? 'tv-game tv-game--big' : 'tv-game'}>
      <p className="tv-game__meta">
        <span className="tv-tag">{t.packs[g.rule_pack]}</span>
        {g.table && <bdi className="tv-game__table">{g.table}</bdi>}
        <span className="tv-game__round">{t.round(g.rounds)}</span>
      </p>
      <div className={`tv-teams tv-teams--${g.teams}`}>
        {g.totals.map((total, i) => {
          const team = i + 1;
          const ahead = total === lead && leaders === 1 && g.rounds > 0;
          return (
            <div key={team} className={ahead ? 'tv-team tv-team--ahead' : 'tv-team'}>
              <span className="tv-team__label">{t.team(team)}</span>
              <span key={total} className="tv-score" aria-live="polite">
                {nf(total)}
              </span>
              <span className="tv-team__names">
                {g.players
                  .filter((p) => p.team === team)
                  .map((p, j) => (
                    <bdi key={`${p.name}-${j}`}>{p.name}</bdi>
                  ))}
              </span>
            </div>
          );
        })}
      </div>
      {g.h2h && (
        <p className="tv-h2h">
          <span className="tv-h2h__title">{t.h2hTitle}</span>
          <span className="tv-h2h__line">
            <bdi>{g.h2h.a}</bdi>
            <span className="tv-h2h__score">
              {g.h2h.games === 0 ? t.h2hNone : `${nf(g.h2h.a_wins)} – ${nf(g.h2h.b_wins)}`}
            </span>
            <bdi>{g.h2h.b}</bdi>
          </span>
          {g.h2h.games > 0 && <span className="tv-h2h__games">{t.games(g.h2h.games)}</span>}
        </p>
      )}
    </article>
  );
}

function Tables({ t, board }: { t: TvCopy; board: TvBoard }) {
  if (board.tables.length === 0) return <p className="tv-muted">{t.noTables}</p>;
  return (
    <section className="tv-tables" aria-labelledby="tv-tables-t">
      <h2 id="tv-tables-t" className="tv-h2">
        {t.tables}
      </h2>
      <ul className="tv-tables__list">
        {board.tables.map((tb, i) => (
          <li key={`${tb.label}-${i}`} className="tv-table">
            <p className="tv-table__head">
              <bdi>{t.table(tb.label, i)}</bdi>
              <span className="tv-tag">{t.games_[tb.game]}</span>
              {tb.need_one && <span className="tv-tag tv-tag--saffron">{t.needOne}</span>}
            </p>
            <ol className="tv-seats" style={{ '--n': tb.seat_count } as CSSProperties}>
              {Array.from({ length: tb.seat_count }, (_, k) => k + 1).map((no) => {
                const s = tb.seats.find((x) => x.no === no);
                return (
                  <li key={no} className={s ? 'tv-seat' : 'tv-seat tv-seat--open'}>
                    {s ? <bdi>{s.name}</bdi> : t.emptySeat}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Last({ t, board }: { t: TvCopy; board: TvBoard }) {
  if (board.tonight.last.length === 0) return null;
  return (
    <section className="tv-last" aria-labelledby="tv-last-t">
      <h2 id="tv-last-t" className="tv-h2">
        {t.lastTitle}
      </h2>
      <ul className="tv-results">
        {board.tonight.last.map((r, i) => (
          <li key={`${r.at}-${i}`}>
            <span className="tv-tag">{t.packs[r.rule_pack]}</span>
            <span>
              <span className="tv-muted">{t.won}</span>{' '}
              {r.winners.map((w, j) => (
                <bdi key={`${w}-${j}`}>
                  {j > 0 && ' · '}
                  {w}
                </bdi>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Crown({ t, names }: { t: TvCopy; names: string[] }) {
  return (
    <section className="tv-crown" aria-labelledby="tv-crown-t">
      <CrownMark />
      <div>
        <h2 id="tv-crown-t" className="tv-h2">
          {t.crown}
        </h2>
        {names.length > 0 ? (
          <p className="tv-crown__names">
            {names.map((n, i) => (
              <bdi key={n}>
                {i > 0 && ' · '}
                {n}
              </bdi>
            ))}
          </p>
        ) : (
          <p className="tv-muted">{t.crownNone}</p>
        )}
      </div>
    </section>
  );
}

function Season({ t, rows }: { t: TvCopy; rows: TvBoard['season'] }) {
  return (
    <section className="tv-season" aria-labelledby="tv-season-t">
      <h2 id="tv-season-t" className="tv-h2">
        {t.season}
      </h2>
      {rows.length === 0 ? (
        <p className="tv-muted">{t.seasonEmpty}</p>
      ) : (
        <table className="tv-standings">
          <thead>
            <tr>
              <th scope="col" className="tv-standings__rank">
                #
              </th>
              <th scope="col" className="tv-standings__name">
                <span className="tv-sr">{t.player}</span>
              </th>
              <th scope="col">{t.played}</th>
              <th scope="col">{t.wins}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className={i === 0 ? 'tv-standings__top' : undefined}>
                <td className="tv-standings__rank">{nf(i + 1)}</td>
                <td className="tv-standings__name">
                  <bdi>{r.name}</bdi>
                </td>
                <td>{nf(r.played)}</td>
                <td className="tv-standings__wins">{nf(r.wins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The latest draw, small, beside the table: one line per team ("Team 1: Ali · Fahad"). */
function DrawSummary({ t, draw }: { t: TvCopy; draw: Draw }) {
  return (
    <section className="tv-drawsum" aria-labelledby="tv-drawsum-t">
      <h2 id="tv-drawsum-t" className="tv-h2">
        {t.draw} <span className="tv-muted">· {t.drawShort(draw.no)}</span>
      </h2>
      <ul className="tv-drawsum__list">
        {draw.tables.map((tb, i) => {
          const teams = [...new Set(tb.seats.map((s) => s.team))].sort((a, b) => a - b);
          return (
            <li key={i}>
              <span className="tv-drawsum__table">
                <bdi>{t.table(tb.label, i)}</bdi>
              </span>
              {teams.map((team) => (
                <span key={team} className={`tv-drawsum__team tv-drawsum__team--t${Math.min(team, 4)}`}>
                  {tb.seats
                    .filter((s) => s.team === team)
                    .map((s, j) => (
                      <bdi key={s.seat}>
                        {j > 0 && ' · '}
                        {s.name}
                      </bdi>
                    ))}
                </span>
              ))}
            </li>
          );
        })}
        {draw.waiting.length > 0 && (
          <li>
            <span className="tv-drawsum__table">{t.waiting}</span>
            <span className="tv-drawsum__team">
              {draw.waiting.map((n, j) => (
                <bdi key={`${n}-${j}`}>
                  {j > 0 && ' · '}
                  {n}
                </bdi>
              ))}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

export function DrawTables({ t, draw, animate }: { t: TvCopy; draw: Draw; animate: boolean }) {
  const order = useMemo(() => new Map(revealOrder(draw).map((x, i) => [x.key, i])), [draw]);
  const style = (key: string) => ({ '--i': order.get(key) ?? 0 }) as CSSProperties;
  return (
    <div className={animate ? 'tv-draw tv-draw--animate' : 'tv-draw'}>
      {draw.tables.map((tb, i) => (
        <div key={i} className="tv-draw__table">
          <p className="tv-draw__label">
            <bdi>{t.table(tb.label, i)}</bdi>
            {tb.game && <span className="tv-tag">{t.games_[tb.game]}</span>}
          </p>
          <ol className="tv-draw__seats">
            {tb.seats.map((s) => (
              <li key={s.seat} className={`tv-draw__seat tv-draw__seat--t${Math.min(s.team, 4)}`} style={style(`${i}-${s.seat}`)}>
                <span className="tv-draw__team">{t.team(s.team)}</span>
                <bdi>{s.name}</bdi>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {draw.waiting.length > 0 && (
        <div className="tv-draw__table tv-draw__table--wait">
          <p className="tv-draw__label">{t.waiting}</p>
          <ol className="tv-draw__seats">
            {draw.waiting.map((n, i) => (
              <li key={`${n}-${i}`} className="tv-draw__seat tv-draw__seat--wait" style={style(`w-${i}`)}>
                <bdi>{n}</bdi>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** The draw's big moment: names land in their seats one by one (all at once with reduced motion). */
function DrawReveal({ t, draw, onClose }: { t: TvCopy; draw: Draw; onClose: () => void }) {
  return (
    <div className="tv-reveal" role="dialog" aria-modal="true" aria-labelledby="tv-reveal-t" onClick={onClose}>
      <div className="tv-reveal__inner">
        <h2 id="tv-reveal-t" className="tv-reveal__title">
          {t.draw}
        </h2>
        <p className="tv-reveal__sub">
          {t.drawNo(draw.no)} · {t.drawFair}
        </p>
        <DrawTables t={t} draw={draw} animate />
      </div>
    </div>
  );
}

function TvMark() {
  return (
    <svg className="tv-mark" viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="58" height="36" rx="5" className="tv-mark__screen" />
      <path d="M22 45h20" className="tv-mark__stand" />
      <path d="M20 27l7-9 6 6 5-4 6 7" className="tv-mark__line" />
    </svg>
  );
}
function CrownMark() {
  return (
    <svg className="tv-crown__mark" viewBox="0 0 48 36" aria-hidden="true" focusable="false">
      <path d="M4 30 L8 8 L18 20 L24 4 L30 20 L40 8 L44 30 Z" />
      <rect x="4" y="31" width="40" height="4" rx="1" />
    </svg>
  );
}

/** Keep the screen awake while the board shows (Screen Wake Lock, where the browser has it). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!on || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!
        .request('screen')
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}

/** Hide the mouse pointer after three quiet seconds (a laptop on HDMI). */
function useIdleCursor(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);
  return idle;
}
