import { useEffect, useState } from 'react';
import { Crown } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { EmptyState } from '../components/EmptyState';
import { ScoreSheetArt } from '../components/Art';
import { NeedsAccount } from '../components/account';
import { ErrorNote, Field, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useAsync } from '../lib/useAsync';
import { leagueDiwaniyas, monthlyCrown, recentGames, standings } from '../lib/api';
import { href, hrefFor } from '../lib/router';

const PICKED = 'dt.league.v1';

/** S11 League: a diwaniya switcher, the season table, this month's crown and the latest games. */
export function League() {
  const { t } = usePrefs();
  return (
    <Screen title={t.league.title}>
      <NeedsAccount>
        <LeagueBody />
      </NeedsAccount>
    </Screen>
  );
}

function LeagueBody() {
  const { c, t, err } = usePrefs();
  const list = useAsync(leagueDiwaniyas, []);
  const [picked, setPicked] = useState(() => localStorage.getItem(PICKED) ?? '');
  useEffect(() => {
    if (picked) localStorage.setItem(PICKED, picked);
  }, [picked]);
  if (list.loading && !list.data) return <Skeleton rows={2} />;
  if (list.error != null && !list.data) return <ErrorNote text={err(list.error)} onRetry={list.reload} />;
  const all = list.data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState
        art={<ScoreSheetArt />}
        title={t.league.emptyTitle}
        body={c.league.noDiwaniyas}
        actions={[{ label: t.tonight.follow, href: hrefFor('tonight'), primary: true }]}
      />
    );
  }
  const current = all.find((d) => d.id === picked) ?? all[0];
  return (
    <>
      {all.length > 1 && (
        <Field label={c.league.switcher}>
          <select className="input" value={current.id} onChange={(e) => setPicked(e.target.value)}>
            {all.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Season id={current.id} name={current.name} />
    </>
  );
}

function Season({ id, name }: { id: string; name: string }) {
  const { c, t, fmt, date, err } = usePrefs();
  const data = useAsync(async () => {
    const [table, games] = await Promise.all([standings(id), recentGames(id, 60)]);
    return { table, games };
  }, [id], ['played_games']);
  if (data.loading && !data.data) return <Skeleton rows={2} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const { table, games } = data.data!;
  if (table.length === 0) {
    return (
      <EmptyState
        art={<ScoreSheetArt />}
        title={t.league.emptyTitle}
        body={t.league.emptyBody}
        actions={[{ label: t.league.score, href: href.score(id), primary: true }]}
      />
    );
  }
  const crown = monthlyCrown(games);
  return (
    <div className="league">
      {crown.length > 0 && (
        <section className="crown" aria-labelledby="crown-t">
          <Crown size={32} weight="fill" aria-hidden="true" className="crown__icon" />
          <div>
            <h2 id="crown-t" className="crown__title">
              {c.league.crown}
            </h2>
            <p className="crown__names">
              {crown.map((n, i) => (
                <span key={n}>
                  {i > 0 && '، '}
                  <bdi>{n}</bdi>
                </span>
              ))}
            </p>
          </div>
        </section>
      )}
      <section className="panel" aria-labelledby="season-t">
        <h2 id="season-t" className="panel__title">
          {c.league.table} · <bdi>{name}</bdi>
        </h2>
        <table className="standings">
          <thead>
            <tr>
              <th scope="col">{c.league.rank}</th>
              <th scope="col">{c.league.player}</th>
              <th scope="col">{c.league.played}</th>
              <th scope="col">{c.league.wins}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => (
              <tr key={r.user_id}>
                <td className="num">{fmt(i + 1)}</td>
                <td>
                  <a className="link" href={href.player(r.user_id)}>
                    <bdi>{r.name}</bdi>
                  </a>
                </td>
                <td className="num">{fmt(r.played)}</td>
                <td className="num">{fmt(r.wins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel" aria-labelledby="history-t">
        <h2 id="history-t" className="panel__title">
          {c.league.history}
        </h2>
        <ul className="history">
          {games.slice(0, 20).map((g) => (
            <li key={g.id} className={g.undone_at ? 'history__item history__item--undone' : 'history__item'}>
              <span className="history__pack">{c.score.packs[g.rule_pack]}</span>
              <span className="history__who">
                {g.results
                  .filter((r) => r.won)
                  .map((r) => r.name)
                  .join('، ')}
              </span>
              <span className="muted small">{g.undone_at ? c.league.undone : date(g.played_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
