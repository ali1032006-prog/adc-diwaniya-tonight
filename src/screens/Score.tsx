import { useEffect, useState } from 'react';
import { Crown, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import { ErrorNote, OkNote, Field } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { WovenBand } from '../components/WovenBand';
import { usePrefs } from '../lib/prefs';
import { useAction, useAsync } from '../lib/useAsync';
import { getOpenNight, recordGame, undoGame, RULE_PACKS, type ResultInput, type RulePack, type TableRow } from '../lib/api';
import { back, hrefFor } from '../lib/router';

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

/** S10 Score a game: full screen at every size, big numbers for the room. */
export function Score({ id, table }: { id: string; table?: string }) {
  const { c } = usePrefs();
  return (
    <div className="score-screen">
      <header className="appbar appbar--push">
        <button type="button" className="icon-btn" aria-label={c.common.close} onClick={() => back(hrefFor('diwaniya'))}>
          <X size={24} aria-hidden="true" />
        </button>
        <h1 className="appbar__title appbar__title--push">{c.score.title}</h1>
      </header>
      <WovenBand className="appbar__band" />
      <div className="screen__body">
        <NeedsAccount>
          <ScoreBody id={id} tableId={table} />
        </NeedsAccount>
      </div>
    </div>
  );
}

function ScoreBody({ id, tableId }: { id: string; tableId?: string }) {
  const { c, fmt, err } = usePrefs();
  const night = useAsync(() => getOpenNight(id), [id]);
  const tb = night.data?.tables.find((x) => x.id === tableId);
  const [pack, setPack] = useState<RulePack>('kout_bo6');
  const [players, setPlayers] = useState<Player[]>(() => Array.from({ length: 6 }, () => ({ user_id: null, name: '' })));
  const [points, setPoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [winner, setWinner] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const act = useAction();

  // Seat the table's players in their seats once the night loads.
  useEffect(() => {
    if (!tb) return;
    setPack(packForTable(tb));
    setPlayers(
      Array.from({ length: 6 }, (_, i) => {
        const s = tb.seats.find((x) => x.seat_no === i + 1);
        return { user_id: s?.user_id ?? null, name: s?.profile?.display_name ?? s?.walk_in_name ?? '' };
      }),
    );
  }, [tb?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = playersFor(pack);
  const teams = pack === 'trix' ? 4 : 2;
  const ready = players.slice(0, n).every((p) => p.name.trim()) && winner > 0;

  return (
    <form
      className="score"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) {
          setNote(c.score.needNames);
          return;
        }
        void act.run(async () => {
          const gid = await recordGame(id, pack, tb?.id ?? null, buildResults(pack, players, points, winner));
          setLast(gid);
          setNote(c.score.saved);
          setPoints([0, 0, 0, 0, 0, 0]);
          setWinner(0);
        });
      }}
    >
      <Field label={c.score.pack}>
        <select
          className="input"
          value={pack}
          onChange={(e) => {
            setPack(e.target.value as RulePack);
            setWinner(0);
          }}
        >
          {RULE_PACKS.map((p) => (
            <option key={p} value={p}>
              {c.score.packs[p]}
            </option>
          ))}
        </select>
      </Field>
      <div className={`score__teams score__teams--${teams}`}>
        {Array.from({ length: teams }, (_, ti) => {
          const team = ti + 1;
          const seats = Array.from({ length: n }, (_, i) => i + 1).filter((s) => teamOf(pack, s) === team);
          return (
            <fieldset key={team} className={winner === team ? 'team team--won' : 'team'}>
              <legend className="team__name">{pack === 'trix' ? c.score.player(team, fmt) : c.score.team(team, fmt)}</legend>
              {seats.map((s) => (
                <input
                  key={s}
                  className="input"
                  aria-label={c.score.player(s, fmt)}
                  placeholder={c.score.player(s, fmt)}
                  maxLength={40}
                  value={players[s - 1].name}
                  onChange={(e) => setPlayers(players.map((p, i) => (i === s - 1 ? { user_id: null, name: e.target.value } : p)))}
                />
              ))}
              <label className="team__points">
                <span className="visually-hidden">
                  {c.score.points} {team}
                </span>
                <input
                  className="score__num"
                  type="number"
                  inputMode="numeric"
                  min={-1000}
                  max={1000}
                  value={points[ti]}
                  onChange={(e) => setPoints(points.map((p, i) => (i === ti ? Number(e.target.value) : p)))}
                />
              </label>
              <button type="button" className="btn btn--quiet btn--small" aria-pressed={winner === team} onClick={() => setWinner(team)}>
                <Crown size={18} weight={winner === team ? 'fill' : 'regular'} aria-hidden="true" />
                {c.score.winner}
              </button>
            </fieldset>
          );
        })}
      </div>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {note && (note === c.score.saved || note === c.score.undone ? <OkNote text={note} /> : <ErrorNote text={note} />)}
      <div className="row">
        <button className="btn btn--primary btn--wide" disabled={act.busy}>
          {c.score.save}
        </button>
        {last && (
          <button
            type="button"
            className="btn btn--quiet"
            disabled={act.busy}
            onClick={() =>
              void act.run(async () => {
                await undoGame(last);
                setLast(null);
                setNote(c.score.undone);
              })
            }
          >
            <ArrowCounterClockwise size={18} aria-hidden="true" />
            {c.score.undo}
          </button>
        )}
      </div>
    </form>
  );
}
