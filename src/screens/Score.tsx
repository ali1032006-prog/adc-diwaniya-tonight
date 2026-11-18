import { useEffect, useState } from 'react';
import { Crown, Trash, ArrowCounterClockwise, ArrowsClockwise, BookOpenText, Plus, Trophy, UserCheck, X } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { EmptyState } from '../components/EmptyState';
import { DallahArt } from '../components/Art';
import { Chips, ErrorNote, OkNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import {
  ApiError,
  addRound,
  discardScore,
  finishScore,
  getOpenNight,
  getSheet,
  openSheet,
  scoreRoster,
  sheetTotals,
  startScore,
  undoGame,
  undoRound,
  RULE_PACKS,
  scoreTargets,
  type ScoreTarget,
  type ResultInput,
  type RosterPerson,
  type RulePack,
  type SheetPlayer,
  type TableRow,
} from '../lib/api';
import { gameOfPack } from '../lib/guides';
import { href, hrefFor } from '../lib/router';

export interface Player {
  user_id: string | null;
  name: string;
}

/** Seats per rule pack. */
export function playersFor(pack: RulePack): number {
  return pack === 'kout_bo6' ? 6 : 4;
}

/** Team of a seat: partners sit across, so seats alternate teams; Trix is every player for himself. */
export function teamOf(pack: RulePack, seat: number): number {
  if (pack === 'trix') return seat;
  return seat % 2 === 1 ? 1 : 2;
}

export function packForTable(t: Pick<TableRow, 'game' | 'seat_count'> | undefined): RulePack {
  if (!t) return 'kout_bo6';
  if (t.game === 'kout') return t.seat_count === 6 ? 'kout_bo6' : 'kout_bo4';
  if (t.game === 'tarneeb') return 'tarneeb_41';
  return t.game;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * A typed name that is exactly someone on the roster becomes that account, so his games reach his
 * league row and profile (ADC-LOG-754 item 3: Ali typed 'Ali' and his own win went nowhere).
 */
export function linkToRoster(players: Player[], roster: RosterPerson[]): Player[] {
  return players.map((p) => {
    if (p.user_id || !p.name.trim()) return p;
    const hit = roster.filter((r) => norm(r.name) === norm(p.name));
    return hit.length === 1 ? { user_id: hit[0].id, name: hit[0].name } : p;
  });
}

/** The seats (1-based) that repeat a player already named in an earlier seat. */
export function duplicateSeats(players: Player[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  players.forEach((p, i) => {
    const key = p.user_id ?? (p.name.trim() ? `guest:${norm(p.name)}` : '');
    if (!key) return;
    if (seen.has(key)) out.push(i + 1);
    seen.add(key);
  });
  return out;
}

/** Turn the score sheet into record_game's results: every seat gets its team's points and win flag. */
export function buildResults(pack: RulePack, players: Player[], points: number[], winner: number): ResultInput[] {
  return players.slice(0, playersFor(pack)).map((p, i) => {
    const seat = i + 1;
    const team = teamOf(pack, seat);
    return {
      seat,
      user_id: p.user_id,
      name: p.name.trim(),
      team,
      points: points[team - 1] ?? 0,
      won: team === winner,
    };
  });
}

/** S10 Score (Ali's change list 3, item 3): the middle tab. Without an id it picks up the table he can score now. */
export function Score({ id, table }: { id?: string; table?: string }) {
  const { c } = usePrefs();
  return (
    <Screen title={c.score.title}>
      <div className="score-screen">
        <NeedsAccount>{id ? <ScoreBody id={id} tableId={table} /> : <ScoreNow />}</NeedsAccount>
      </div>
    </Screen>
  );
}

/** What to score right now, best first (server: score_targets); the first one opens straight away. */
function ScoreNow() {
  const { c, t, err } = usePrefs();
  const targets = useAsync(scoreTargets, [], ['seats', 'requests', 'nights', 'game_tables', 'regulars']);
  const [pick, setPick] = useState('');
  if (targets.loading && !targets.data) return <Skeleton rows={3} />;
  if (targets.error != null && !targets.data) return <ErrorNote text={err(targets.error)} onRetry={targets.reload} />;
  const list = targets.data?.targets ?? [];
  if (list.length === 0) {
    const reason = targets.data?.reason ?? 'none';
    const [title, body] =
      reason === 'approved'
        ? [c.scoreTab.approvedTitle, c.scoreTab.approvedBody]
        : reason === 'pending'
          ? [c.scoreTab.pendingTitle, c.scoreTab.pendingBody]
          : [c.scoreTab.noneTitle, c.scoreTab.noneBody];
    return <EmptyState art={<DallahArt />} title={title} body={body} actions={[{ label: c.scoreTab.toTonight, href: hrefFor('tonight'), primary: true }]} />;
  }
  const keyOf = (x: ScoreTarget) => `${x.diwaniya_id}:${x.table_id ?? ''}`;
  const cur = list.find((x) => keyOf(x) === pick) ?? list[0];
  const tableName = (x: ScoreTarget) => (x.table_id ? x.label || (x.game ? t.games[x.game] : c.roster.thisTable) : c.scoreTab.noTable);
  return (
    <>
      <div className="score-now">
        {list.length > 1 ? (
          // No dropdowns on this page (ADC-LOG-794 item 1): the tables to score are chips.
          <div className="score-pick">
            <p className="score-pick__label">{c.scoreTab.others}</p>
            <Chips<string>
              legend={c.scoreTab.others}
              value={[keyOf(cur)]}
              options={list.map((x) => ({ value: keyOf(x), label: `${c.scoreTab.lead(x.name, tableName(x))} · ${c.scoreTab.why[x.why]}` }))}
              onChange={(v) => setPick(v[0] ?? '')}
            />
          </div>
        ) : (
          <p className="score-now__lead">
            <bdi>{c.scoreTab.lead(cur.name, tableName(cur))}</bdi>
            <span className="tag tag--camel">{c.scoreTab.why[cur.why]}</span>
          </p>
        )}
      </div>
      <ScoreBody key={keyOf(cur)} id={cur.diwaniya_id} tableId={cur.table_id ?? undefined} />
    </>
  );
}

/** The seats of a sheet as record_game players: Trix seats are their own team. */
export function sheetPlayers(pack: RulePack, players: Player[]): SheetPlayer[] {
  return players.slice(0, playersFor(pack)).map((p, i) => ({ seat: i + 1, user_id: p.user_id, name: p.name.trim(), team: teamOf(pack, i + 1) }));
}

/** The team ahead on the running totals, or 0 on a tie. */
export function leader(totals: number[]): number {
  if (totals.length === 0) return 0;
  const max = Math.max(...totals);
  return totals.filter((x) => x === max).length === 1 ? totals.indexOf(max) + 1 : 0;
}

/**
 * Live scoring (Ali, ADC-LOG-764 item 3): pick the players once, then score round by round. Every
 * round is saved on the server as it is added, so a refresh or another phone at the same table
 * picks the game up where it is; finish sends the running totals to the league.
 */
function ScoreBody({ id, tableId }: { id: string; tableId?: string }) {
  const { userId } = useSession();
  const open = useAsync(() => openSheet(id, tableId ?? null, userId), [id, tableId, userId], ['score_sheets']);
  const [mine, setMine] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (open.loading && !open.data && !mine) return <Skeleton rows={3} />;
  const current = mine ?? open.data?.id ?? null;
  if (current) {
    return (
      <LiveSheet
        key={current}
        diwaniyaId={id}
        sheetId={current}
        notice={note}
        onNext={(next) => {
          setNote('');
          setMine(next);
          open.reload();
        }}
      />
    );
  }
  return (
    <SetupSheet
      id={id}
      tableId={tableId}
      onStarted={(sid) => setMine(sid)}
      onTaken={() => {
        setNote('taken');
        open.reload();
      }}
    />
  );
}

function SetupSheet({ id, tableId, onStarted, onTaken }: { id: string; tableId?: string; onStarted: (sheet: string) => void; onTaken: () => void }) {
  const { c, fmt, err } = usePrefs();
  const { userId } = useSession();
  const night = useAsync(() => getOpenNight(id), [id]);
  const roster = useAsync(() => scoreRoster(id, tableId ?? null), [id, tableId]);
  const tb = night.data?.tables.find((x) => x.id === tableId);
  const [pack, setPack] = useState<RulePack>('kout_bo6');
  const [players, setPlayers] = useState<Player[]>(() => Array.from({ length: 6 }, () => ({ user_id: null, name: '' })));
  const [note, setNote] = useState('');
  const act = useAction();
  const people = roster.data ?? [];
  const blocked = roster.error instanceof ApiError && roster.error.code === '42501';

  // Seat the table's players in their seats once the night loads; with no table, seat 1 is me.
  useEffect(() => {
    if (tb) {
      setPack(packForTable(tb));
      setPlayers(
        Array.from({ length: 6 }, (_, i) => {
          const s = tb.seats.find((x) => x.seat_no === i + 1);
          return { user_id: s?.user_id ?? null, name: s?.profile?.display_name ?? s?.walk_in_name ?? '' };
        }),
      );
      return;
    }
    const me = people.find((p) => p.id === userId);
    // Seat 1 is me unless someone is already typed there or I sit elsewhere (the room loads late).
    if (!tableId && me) setPlayers((ps) => (ps[0].name.trim() || ps.some((p) => p.user_id === me.id) ? ps : ps.map((p, i) => (i === 0 ? { user_id: me.id, name: me.name } : p))));
  }, [tb?.id, roster.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = playersFor(pack);
  const teams = pack === 'trix' ? 4 : 2;
  const seated = players.slice(0, n);
  const setSeat = (s: number, p: Player) => setPlayers((ps) => ps.map((x, i) => (i === s - 1 ? p : x)));
  // The seat a tapped name goes to (see seatPerson).
  const [active, setActive] = useState<number | null>(null);
  const linked = linkToRoster(seated, people);
  // A typed name that is someone already seated is the same person twice (ali = Ali).
  const dups = duplicateSeats(linked);
  const inRoom = people.filter((r) => !linked.some((p) => p.user_id === r.id));
  const empty = seated.findIndex((p) => !p.name.trim()) + 1;
  const canSeat = (active !== null && active <= n) || empty > 0;
  const seatPerson = (r: RosterPerson) => {
    // The seat being typed in if it is still empty, else the next empty seat; with every seat full,
    // the seat last typed in is swapped (a typed name is never overwritten while a seat is free).
    const here = active !== null && active <= n ? active : 0;
    const to = here && !seated[here - 1].name.trim() ? here : empty || here;
    if (!to) return;
    setSeat(to, { user_id: r.id, name: r.name });
    setActive(null);
  };

  if (blocked) return <ErrorNote text={c.roster.notAllowed} />;

  return (
    <form
      className="score"
      onSubmit={(e) => {
        e.preventDefault();
        if (dups.length > 0) {
          setNote(c.roster.twice(dups.map((d) => fmt(d)).join(c.common.sep)));
          return;
        }
        if (!seated.every((p) => p.name.trim())) {
          setNote(c.score.needNames);
          return;
        }
        setNote('');
        void act.run(async () => {
          try {
            onStarted(await startScore(id, pack, tb?.id ?? tableId ?? null, sheetPlayers(pack, linkToRoster(players, people))));
          } catch (x) {
            if (x instanceof ApiError && x.code === '23505') onTaken();
            else throw x;
          }
        });
      }}
    >
      {tb && <p className="muted small">{c.roster.forTable(tb.label || c.roster.thisTable)}</p>}
      <div className="score__head">
        <div className="score-pick">
          <p className="score-pick__label">{c.score.pack}</p>
          <Chips<RulePack> legend={c.score.pack} value={[pack]} options={RULE_PACKS.map((p) => ({ value: p, label: c.score.packs[p] }))} onChange={(v) => v[0] && setPack(v[0])} />
        </div>
        <GuideLink pack={pack} />
      </div>
      <h2 className="section-title">{c.score.whoPlays}</h2>
      {inRoom.length > 0 && (
        <div className="room" role="group" aria-label={c.roster.room}>
          <p className="room__title">{c.roster.room}</p>
          <p className="muted small">{c.roster.roomHint}</p>
          <ul className="room__list">
            {inRoom.map((r) => (
              <li key={r.id}>
                <button type="button" className="chip chip--person" aria-label={c.roster.add(r.name)} onMouseDown={(e) => e.preventDefault()} disabled={!canSeat} onClick={() => seatPerson(r)}>
                  <Plus size={14} aria-hidden="true" />
                  <bdi>{r.name}</bdi>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`score__teams score__teams--${teams}`}>
        {Array.from({ length: teams }, (_, ti) => {
          const team = ti + 1;
          const seats = Array.from({ length: n }, (_, i) => i + 1).filter((s) => teamOf(pack, s) === team);
          return (
            <fieldset key={team} className="team">
              <legend className="team__name">{pack === 'trix' ? c.score.player(team, fmt) : c.score.team(team, fmt)}</legend>
              {seats.map((s) => (
                <SeatPick
                  key={s}
                  seat={s}
                  value={players[s - 1]}
                  linked={!!linked[s - 1]?.user_id}
                  dup={dups.includes(s)}
                  onFocus={() => setActive(s)}
                  onChange={(p) => setSeat(s, p)}
                />
              ))}
            </fieldset>
          );
        })}
      </div>
      <p className="muted small">{c.score.live}</p>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {note && <ErrorNote text={note} />}
      <button className="btn btn--primary btn--wide" disabled={act.busy}>
        {c.score.start}
      </button>
    </form>
  );
}

function GuideLink({ pack }: { pack: RulePack }) {
  const { c } = usePrefs();
  return (
    <a className="btn btn--text btn--small score__guide" href={href.guides(gameOfPack(pack), 'score')}>
      <BookOpenText size={18} aria-hidden="true" />
      {c.score.howToScore}
    </a>
  );
}

function LiveSheet({ diwaniyaId, sheetId, notice, onNext }: { diwaniyaId: string; sheetId: string; notice: string; onNext: (next: string | null) => void }) {
  const { c, fmt, err } = usePrefs();
  const data = useAsync(() => getSheet(sheetId), [sheetId], ['score_rounds', 'score_sheets']);
  const act = useAction();
  const [draft, setDraft] = useState<string[]>([]);
  const [winner, setWinner] = useState(0);
  const [result, setResult] = useState<{ game: string; undone: boolean } | null>(null);
  const [note, setNote] = useState('');

  if (data.loading && !data.data) return <Skeleton rows={3} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const sheet = data.data?.sheet;
  if (!sheet) return <ErrorNote text={c.errors.notFound} />;
  const rounds = data.data!.rounds;
  const totals = sheetTotals(sheet.teams, rounds);
  const lead = leader(totals);
  const chosen = winner || lead;
  const live = rounds.filter((r) => !r.undone_at);
  const label = (team: number) => (sheet.rule_pack === 'trix' ? sheet.players.find((p) => p.team === team)?.name ?? c.score.player(team, fmt) : c.score.team(team, fmt));
  const names = (team: number) => sheet.players.filter((p) => p.team === team).map((p) => p.name).join(c.common.sep);
  const signed = sheet.rule_pack === 'trix';
  const parse = (v: string | undefined) => {
    const x = Number((v ?? '').trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('−', '-'));
    return Number.isFinite(x) ? Math.trunc(x) : NaN;
  };
  const again = () =>
    void act.run(async () => {
      onNext(await startScore(diwaniyaId, sheet.rule_pack, sheet.table_id, sheet.players));
    });

  if (result || sheet.status !== 'open') {
    const gameId = result?.game ?? sheet.game_id;
    return (
      <section className="score score--done" aria-live="polite">
        <Scoreboard totals={totals} lead={sheet.status === 'finished' ? 0 : lead} label={label} names={names} teams={sheet.teams} />
        {result?.undone ? <OkNote text={c.score.undone} /> : sheet.status === 'discarded' ? <OkNote text={c.score.discarded} /> : <OkNote text={c.score.sent} />}
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={act.busy} onClick={again}>
            <ArrowsClockwise size={18} aria-hidden="true" />
            {c.score.again}
          </button>
          {gameId && !result?.undone && (result || sheet.status === 'finished') && (
            <button
              type="button"
              className="btn btn--quiet"
              disabled={act.busy}
              onClick={() =>
                void act.run(async () => {
                  await undoGame(gameId);
                  setResult({ game: gameId, undone: true });
                })
              }
            >
              <ArrowCounterClockwise size={18} aria-hidden="true" />
              {c.score.undo}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="score score--live">
      {notice === 'taken' && <OkNote text={c.score.taken} />}
      <div className="score__head">
        <p className="score__pack">{c.score.packs[sheet.rule_pack]}</p>
        <GuideLink pack={sheet.rule_pack} />
      </div>
      <Scoreboard totals={totals} lead={lead} label={label} names={names} teams={sheet.teams} />
      <p className="muted small">{c.score.live}</p>

      <form
        className="panel round-form"
        aria-labelledby="round-t"
        onSubmit={(e) => {
          e.preventDefault();
          const pts = Array.from({ length: sheet.teams }, (_, i) => parse(draft[i] || '0'));
          if (pts.some((x) => Number.isNaN(x) || x < -1000 || x > 1000)) {
            setNote(c.errors.invalid);
            return;
          }
          setNote('');
          void act.run(async () => {
            await addRound(sheetId, pts);
            setDraft([]);
            data.reload();
          });
        }}
      >
        <h2 id="round-t" className="panel__title">
          {c.score.round(live.length + 1, fmt)} · <span className="muted">{c.score.thisRound}</span>
        </h2>
        <div className={`round-form__grid round-form__grid--${sheet.teams}`}>
          {Array.from({ length: sheet.teams }, (_, i) => (
            <label key={i} className="round-form__cell">
              <span className="round-form__who">{label(i + 1)}</span>
              <input
                className="score__num"
                inputMode={signed ? 'text' : 'numeric'}
                pattern={signed ? '[-−]?[0-9٠-٩]*' : '[0-9٠-٩]*'}
                autoComplete="off"
                placeholder={fmt(0)}
                value={draft[i] ?? ''}
                onChange={(e) => setDraft(Array.from({ length: sheet.teams }, (_, j) => (j === i ? e.target.value : draft[j] ?? '')))}
              />
            </label>
          ))}
        </div>
        {note && <ErrorNote text={note} />}
        {act.error != null && <ErrorNote text={err(act.error)} />}
        <button className="btn btn--primary btn--wide" disabled={act.busy}>
          <Plus size={18} aria-hidden="true" />
          {c.score.addRound}
        </button>
      </form>

      <section className="panel" aria-labelledby="rounds-t">
        <h2 id="rounds-t" className="panel__title">
          {c.score.rounds}
        </h2>
        {rounds.length === 0 ? (
          <p className="muted">{c.score.noRounds}</p>
        ) : (
          <table className="rounds">
            <thead>
              <tr>
                <th scope="col">#</th>
                {Array.from({ length: sheet.teams }, (_, i) => (
                  <th key={i} scope="col">
                    <bdi>{label(i + 1)}</bdi>
                  </th>
                ))}
                <th scope="col">
                  <span className="visually-hidden">{c.score.undo}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rounds].reverse().map((r) => (
                <tr key={r.round_no} className={r.undone_at ? 'rounds__row rounds__row--undone' : 'rounds__row'}>
                  <td className="num">{fmt(r.round_no)}</td>
                  {r.points.map((x, i) => (
                    <td key={i} className="num">
                      {fmt(x)}
                    </td>
                  ))}
                  <td className="rounds__act">
                    {r.undone_at ? (
                      <span className="muted small">{c.score.roundUndone}</span>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn icon-btn--small"
                        aria-label={c.score.undoRound(r.round_no, fmt)}
                        disabled={act.busy}
                        onClick={() =>
                          void act.run(async () => {
                            await undoRound(sheetId, r.round_no);
                            data.reload();
                          })
                        }
                      >
                        <ArrowCounterClockwise size={18} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel finish" aria-labelledby="finish-t">
        <h2 id="finish-t" className="panel__title">
          {c.score.finishTitle}
        </h2>
        <fieldset className="field">
          <legend className="field__label">{c.score.winner}</legend>
          <div className="segmented">
            {Array.from({ length: sheet.teams }, (_, i) => (
              <label key={i} className="segmented__opt">
                <input type="radio" name="winner" checked={chosen === i + 1} onChange={() => setWinner(i + 1)} />
                <span>
                  <Crown size={16} weight={chosen === i + 1 ? 'fill' : 'regular'} aria-hidden="true" /> <bdi>{label(i + 1)}</bdi>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          className="btn btn--primary btn--wide"
          disabled={act.busy || live.length === 0 || chosen === 0}
          onClick={() =>
            void act.run(async () => {
              const game = await finishScore(sheetId, chosen);
              setResult({ game, undone: false });
            })
          }
        >
          <Trophy size={18} aria-hidden="true" />
          {c.score.finish}
        </button>
        {live.length === 0 && <p className="muted small">{c.score.needRound}</p>}
        <button
          type="button"
          className="btn btn--danger btn--small"
          disabled={act.busy}
          onClick={() =>
            window.confirm(c.score.discardConfirm) &&
            void act.run(async () => {
              await discardScore(sheetId);
              data.reload();
            })
          }
        >
          <Trash size={16} aria-hidden="true" />
          {c.score.discard}
        </button>
      </section>
    </div>
  );
}

/** The running totals, big enough to read across the room; the leader carries the crown. */
function Scoreboard({ totals, lead, label, names, teams }: { totals: number[]; lead: number; label: (t: number) => string; names: (t: number) => string; teams: number }) {
  const { c, fmt } = usePrefs();
  return (
    <div className={`scoreboard scoreboard--${teams}`} role="group" aria-label={c.score.total}>
      {totals.map((x, i) => (
        <div key={i} className={lead === i + 1 ? 'scoreboard__team scoreboard__team--lead' : 'scoreboard__team'}>
          <span className="scoreboard__name">
            <bdi>{label(i + 1)}</bdi>
          </span>
          {teams === 2 && (
            <span className="scoreboard__who muted small">
              <bdi>{names(i + 1)}</bdi>
            </span>
          )}
          <span className="scoreboard__total" aria-live="polite">
            {fmt(x)}
          </span>
          {lead === i + 1 && (
            <span className="tag tag--saffron scoreboard__lead">
              <Crown size={14} weight="fill" aria-hidden="true" />
              {c.score.leading}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * One seat (ADC-LOG-794 item 1): a name box. People at the table come in already; anyone else is
 * typed, or tapped from the room below. A name that matches someone in the room links to his account.
 */
function SeatPick({ seat, value, linked, dup, onFocus, onChange }: { seat: number; value: Player; linked: boolean; dup: boolean; onFocus: () => void; onChange: (p: Player) => void }) {
  const { c, fmt } = usePrefs();
  return (
    <div className={dup ? 'seat-pick-field seat-pick-field--dup' : 'seat-pick-field'}>
      <div className="seat-name">
        <input
          className="input seat-name__input"
          aria-label={c.score.player(seat, fmt)}
          aria-invalid={dup || undefined}
          placeholder={c.roster.typeName}
          maxLength={40}
          value={value.name}
          onFocus={onFocus}
          onChange={(e) => onChange({ user_id: null, name: e.target.value })}
        />
        {linked && (
          <span className="seat-name__linked" title={c.roster.linked}>
            <UserCheck size={18} aria-hidden="true" />
            <span className="visually-hidden">{c.roster.linked}</span>
          </span>
        )}
        {value.name && (
          <button type="button" className="seat-name__clear" aria-label={c.roster.clear(fmt(seat))} onClick={() => onChange({ user_id: null, name: '' })}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
