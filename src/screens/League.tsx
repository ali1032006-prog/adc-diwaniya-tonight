import { useEffect, useState } from 'react';
import { Crown, ChartBar, Lightning, MapPin, Star, Heart, Footprints, CalendarCheck } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { EmptyState } from '../components/EmptyState';
import { ScoreSheetArt, DallahArt } from '../components/Art';
import { NeedsAccount } from '../components/account';
import { ErrorNote, Field, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useAsync } from '../lib/useAsync';
import { areaLabel } from '../lib/areas';
import { leagueDiwaniyas, monthlyCrown, myDiwaniyaList, recentGames, standings, type MyDiwaniya } from '../lib/api';
import { href, hrefFor } from '../lib/router';

const PICKED = 'dt.league.v1';
const VIEW = 'dt.league.view.v1';
type View = 'mine' | 'season';

/** S11 League: My diwaniyas with tonight's status (ADC-LOG-754 item 6), and each diwaniya's season. */
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
  const { c } = usePrefs();
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW) === 'season' ? 'season' : 'mine'));
  useEffect(() => localStorage.setItem(VIEW, view), [view]);
  return (
    <>
      <div
        className="seg-tabs"
        role="tablist"
        aria-label={c.mine.views}
        onKeyDown={(e) => {
          // ARIA tabs: arrows move between the two views (mirrored in RTL), Home/End jump.
          const rtl = document.documentElement.dir === 'rtl';
          const next = e.key === 'Home' ? 'mine' : e.key === 'End' ? 'season' : e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? 'season' : e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') ? 'mine' : null;
          if (!next) return;
          e.preventDefault();
          setView(next);
          document.getElementById(`lv-${next}`)?.focus();
        }}
      >
        {(['mine', 'season'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`lv-${v}`}
            aria-selected={view === v}
            aria-controls={`lp-${v}`}
            tabIndex={view === v ? 0 : -1}
            className="seg-tabs__tab"
            onClick={() => setView(v)}
          >
            {v === 'mine' ? c.mine.title : c.mine.season}
          </button>
        ))}
        <span className="seg-tabs__pill" aria-hidden="true" style={{ ['--i' as string]: view === 'mine' ? 0 : 1 }} />
      </div>
      <div role="tabpanel" id={`lp-${view}`} aria-labelledby={`lv-${view}`} className="seg-panel" key={view}>
        {view === 'mine' ? <MyDiwaniyas onSeason={() => setView('season')} /> : <SeasonPicker />}
      </div>
    </>
  );
}

const WHY_ICON = { follow: Heart, regular: Star, visit: Footprints, tonight: CalendarCheck } as const;

/** My diwaniyas: where I go or follow, each with tonight's state and my request. */
export function MyDiwaniyas({ onSeason }: { onSeason?: () => void }) {
  const { c, t, fmt, err, prefs } = usePrefs();
  const list = useAsync(myDiwaniyaList, [], ['nights', 'requests', 'seats', 'game_tables']);
  if (list.loading && !list.data) return <Skeleton rows={2} />;
  if (list.error != null && !list.data) return <ErrorNote text={err(list.error)} onRetry={list.reload} />;
  const all = list.data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState
        art={<DallahArt />}
        title={c.mine.emptyTitle}
        body={c.mine.emptyBody}
        actions={[{ label: t.tonight.follow, href: hrefFor('tonight'), primary: true }]}
      />
    );
  }
  const open = all.filter((d) => d.night_id).length;
  return (
    <>
      <p className="count-line" aria-live="polite">
        {c.mine.openCount(open, fmt)}
      </p>
      <ul className="mine">
        {all.map((d) => (
          <li key={d.id} className={d.night_id ? 'mine__item mine__item--open' : 'mine__item'}>
            <a className="mine__main" href={href.place(d.id)}>
              <span className="mine__name">
                <bdi>{d.name}</bdi>
              </span>
              <span className="mine__meta muted small">
                <MapPin size={14} aria-hidden="true" /> <bdi>{areaLabel(d.area, prefs.lang)}</bdi>
                {d.why.map((w) => {
                  const I = WHY_ICON[w];
                  return (
                    <span key={w} className="mine__why">
                      <I size={14} aria-hidden="true" /> {c.mine.why[w]}
                    </span>
                  );
                })}
              </span>
              <MineStatus d={d} />
            </a>
            {(d.my_status === 'arrived' || d.seated_table) && d.night_id && (
              <a
                className="btn btn--quiet btn--small mine__act"
                href={href.score(d.id, d.seated_table ?? d.my_table ?? undefined)}
                aria-label={`${c.quick.score} · ${d.name}`}
              >
                <ChartBar size={18} aria-hidden="true" />
                {c.quick.score}
              </a>
            )}
          </li>
        ))}
      </ul>
      {onSeason && (
        <button type="button" className="btn btn--text" onClick={onSeason}>
          <Crown size={18} aria-hidden="true" />
          {c.mine.toSeason}
        </button>
      )}
    </>
  );
}

function MineStatus({ d }: { d: MyDiwaniya }) {
  const { c, t, fmt, time } = usePrefs();
  if (!d.night_id) return <span className="mine__status muted">{c.mine.closed}</span>;
  return (
    <span className="mine__status">
      <span className="mine__open">{c.mine.openAt(time(d.starts_at!))}</span>
      <span className="mine__seats">{t.seatsOpen(Math.max(0, d.open_seats ?? 0), fmt)}</span>
      {d.need_one && (
        <span className="tag tag--saffron">
          <Lightning size={14} weight="fill" aria-hidden="true" />
          {c.tonight.needOne}
        </span>
      )}
      {d.my_status ? (
        <span key={d.my_status} className={`status status--${d.my_status}`}>
          {c.status[d.my_status]}
        </span>
      ) : (
        <span className="muted small">{c.mine.noRequest}</span>
      )}
    </span>
  );
}

function SeasonPicker() {
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
      <div className="season-head">
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
        <a className="btn btn--primary btn--small season-head__score" href={href.score(current.id)}>
          <ChartBar size={18} aria-hidden="true" />
          {t.league.score}
        </a>
      </div>
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
              <tr key={r.player_key ?? r.user_id ?? r.name}>
                <td className="num">{fmt(i + 1)}</td>
                <td>
                  {r.user_id ? (
                    <a className="link" href={href.player(r.user_id)}>
                      <bdi>{r.name}</bdi>
                    </a>
                  ) : (
                    <span className="standings__guest">
                      <bdi>{r.name}</bdi> <span className="tag tag--quiet">{c.mine.walkIn}</span>
                    </span>
                  )}
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
