import { useEffect, useMemo, useState } from 'react';
import { Lightning, UsersThree, Armchair } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { RequestSheet } from './Place';
import { EmptyState } from '../components/EmptyState';
import { SeatRing } from '../components/SeatRing';
import { TableRing, NeedsAccount } from '../components/account';
import { Chips, ErrorNote, OkNote, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import { areaLabel, governorateLabel, governorateOf } from '../lib/areas';
import { ApiError, GAMES, checkIn, getOpenNight, listTonight, myDiwaniyaList, openSeats, type Game, type MyDiwaniya, type NightRow } from '../lib/api';
import { href, hrefFor } from '../lib/router';

export type Scope = 'all' | 'gov' | 'area';
const SCOPE_KEY = 'dt.tonight.scope.v1';

/** Filter tonight's nights by game, by whether a seat is still open, and by the user's area or governorate. */
export function filterNights(nights: NightRow[], games: Game[], openOnly: boolean, scope: Scope = 'all', myArea = ''): NightRow[] {
  const myGov = governorateOf(myArea);
  return nights
    .filter((n) => {
      if (scope === 'all' || !myArea) return true;
      if (scope === 'area') return areaLabel(n.diwaniya?.area, 'ar') === areaLabel(myArea, 'ar');
      return myGov !== null && governorateOf(n.diwaniya?.area) === myGov;
    })
    .map((n) => ({ ...n, tables: games.length ? n.tables.filter((t) => games.includes(t.game)) : n.tables }))
    .filter((n) => n.tables.length > 0 || games.length === 0)
    .filter((n) => !openOnly || n.tables.some((t) => openSeats(t) > 0));
}

/** My nights tonight that want an action now: pending, approved (sit) or arrived (score). */
export function activeNights(list: MyDiwaniya[]): MyDiwaniya[] {
  return list.filter((d) => d.night_id && (d.my_status === 'pending' || d.my_status === 'approved' || d.my_status === 'arrived'));
}

/** S5 Tonight: diwaniyas open tonight, each led by its seat rings. */
export function Tonight() {
  const { t } = usePrefs();
  return (
    <Screen title={t.tonight.title}>
      <NeedsAccount>
        <TonightList />
      </NeedsAccount>
    </Screen>
  );
}

/**
 * Your night (fewer taps, ADC-LOG-754 item 7): the request you are waiting on, the seat you can
 * take now, the table you can score, one tap each from the Tonight tab.
 */
function YourNight({ mine, onDone }: { mine: MyDiwaniya[]; onDone: () => void }) {
  const { c, t, fmt, time, err } = usePrefs();
  const act = useAction();
  const [ok, setOk] = useState('');
  const list = activeNights(mine);
  if (list.length === 0) return null;
  return (
    <section className="your-night" aria-labelledby="yn-t">
      <h2 id="yn-t" className="section-title">
        {c.quick.yourNight}
      </h2>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {ok && <OkNote text={ok} />}
      <ul className="your-night__list">
        {list.map((d) => (
          <li key={d.id} className="your-night__item">
            <a className="your-night__name" href={href.place(d.id)}>
              <span><bdi>{d.name}</bdi></span>
              <span className="muted small">{c.tonight.starts(time(d.starts_at!))}</span>
            </a>
            <span key={d.my_status} className={`status status--${d.my_status}`}>
              {c.status[d.my_status!]}
            </span>
            <span className="your-night__acts">
              {d.my_status === 'approved' && !d.seated_table && (
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={act.busy}
                  aria-label={`${c.quick.sitNow} · ${d.name}`}
                  onClick={() =>
                    void act.run(async () => {
                      const night = await getOpenNight(d.id);
                      const tb = sitTarget(night, d.my_table);
                      if (!tb) throw new ApiError('23505', 'no free seat');
                      await checkIn(tb.table, tb.seat);
                      setOk(c.quick.seated(t.games[tb.game], fmt(tb.seat)));
                      onDone();
                    })
                  }
                >
                  <Armchair size={18} aria-hidden="true" />
                  {c.quick.sitNow}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The seat a one-tap check-in takes: the first free seat at the requested table, else at any table. */
export function sitTarget(night: NightRow | null, wanted: string | null): { table: string; seat: number; game: Game } | null {
  if (!night) return null;
  const order = [...night.tables].sort((a, b) => (a.id === wanted ? -1 : b.id === wanted ? 1 : 0));
  for (const tb of order) {
    for (let n = 1; n <= tb.seat_count; n++) if (!tb.seats.some((s) => s.seat_no === n)) return { table: tb.id, seat: n, game: tb.game };
  }
  return null;
}

function TonightList() {
  const { t, c, fmt, time, err, prefs } = usePrefs();
  const { profile, userId } = useSession();
  const nights = useAsync(listTonight, [], ['nights', 'game_tables', 'seats']);
  const mine = useAsync(myDiwaniyaList, [], ['requests', 'seats']);
  const [games, setGames] = useState<Game[]>([]);
  const [openOnly, setOpenOnly] = useState(false);
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem(SCOPE_KEY) as Scope) || 'all');
  const [asking, setAsking] = useState<NightRow | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => localStorage.setItem(SCOPE_KEY, scope), [scope]);
  const myArea = profile?.area ?? '';
  const shown = useMemo(() => filterNights(nights.data ?? [], games, openOnly, scope, myArea), [nights.data, games, openOnly, scope, myArea]);
  const status = useMemo(() => new Map((mine.data ?? []).filter((d) => d.night_id).map((d) => [d.night_id!, d.my_status])), [mine.data]);

  if (nights.loading && !nights.data) return <Skeleton rows={3} />;
  if (nights.error != null && !nights.data) return <ErrorNote text={err(nights.error)} onRetry={nights.reload} />;
  const all = nights.data ?? [];
  const reload = () => {
    nights.reload();
    mine.reload();
  };
  return (
    <>
      <YourNight mine={mine.data ?? []} onDone={reload} />
      {notice && <OkNote text={notice} />}
      {all.length === 0 ? (
        <EmptyState
          art={<SeatRing game="kout" seats={[null, null, null, null, null, null]} size={132} decorative />}
          title={t.tonight.emptyTitle}
          body={t.tonight.emptyBody}
          actions={[{ label: t.tonight.openYours, href: hrefFor('diwaniya'), primary: true }]}
        />
      ) : (
        <>
          <div className="filters" role="group" aria-label={c.tonight.filterLabel}>
            {myArea && (
              <Chips<Scope>
                legend={c.quick.scope}
                value={[scope]}
                options={[
                  { value: 'all', label: c.quick.scopeAll },
                  { value: 'gov', label: governorateLabel(governorateOf(myArea), prefs.lang) || c.quick.scopeGov },
                  { value: 'area', label: c.quick.scopeArea(areaLabel(myArea, prefs.lang)) },
                ]}
                onChange={(v) => setScope(v[0] ?? 'all')}
              />
            )}
            <Chips<Game>
              legend={c.tonight.filterLabel}
              multi
              value={games}
              options={GAMES.map((g) => ({ value: g, label: t.games[g] }))}
              onChange={setGames}
            />
            <label className="chip">
              <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
              <span>{c.tonight.openOnly}</span>
            </label>
          </div>
          <p className="count-line" aria-live="polite">
            {c.tonight.live(shown.length, fmt)}
          </p>
          {shown.length === 0 ? (
            <div className="empty empty--inline">
              <p className="empty__title">{scope !== 'all' ? c.quick.noneInScope : c.tonight.noMatch}</p>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  setGames([]);
                  setOpenOnly(false);
                  setScope('all');
                }}
              >
                {c.tonight.clear}
              </button>
            </div>
          ) : (
            <ul className="cards">
              {shown.map((n, i) => {
                const st = status.get(n.id);
                const host = n.diwaniya?.host_id === userId;
                const free = n.tables.some((tb) => openSeats(tb) > 0);
                return (
                  <li key={n.id} className="card-wrap" style={{ ['--n' as string]: Math.min(i, 8) }}>
                    <a className="night-card" href={href.place(n.diwaniya!.id)}>
                      <div className="night-card__rings">
                        {n.tables.slice(0, 3).map((tb) => (
                          <TableRing key={tb.id} table={tb} size={80} />
                        ))}
                      </div>
                      <div className="night-card__text">
                        <h2 className="night-card__name">
                          <bdi>{n.diwaniya?.name}</bdi>
                        </h2>
                        <p className="night-card__meta">
                          <bdi>{areaLabel(n.diwaniya?.area, prefs.lang)}</bdi> · {c.tonight.starts(time(n.starts_at))}
                        </p>
                        <p className="night-card__tags">
                          {n.tables.some((tb) => tb.need_one) && (
                            <span className="tag tag--saffron">
                              <Lightning size={14} weight="fill" aria-hidden="true" />
                              {c.tonight.needOne}
                            </span>
                          )}
                          {n.diwaniya?.visibility === 'followers' && (
                            <span className="tag tag--camel">
                              <UsersThree size={14} aria-hidden="true" />
                              {c.tonight.followers}
                            </span>
                          )}
                        </p>
                      </div>
                    </a>
                    {!host && (st ? (
                      <p className="night-card__act">
                        <span className={`status status--${st}`}>{c.status[st]}</span>
                      </p>
                    ) : (
                      free && (
                        <p className="night-card__act">
                          <button
                            type="button"
                            className="btn btn--quiet btn--small"
                            aria-label={`${c.place.request} · ${n.diwaniya?.name ?? ''}`}
                            onClick={() => setAsking(n)}
                          >
                            {c.place.request}
                          </button>
                        </p>
                      )
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {asking && (
        <RequestSheet
          night={asking}
          onClose={() => setAsking(null)}
          onSent={(auto) => {
            setAsking(null);
            setNotice(auto ? c.requestSheet.autoApproved : c.requestSheet.sent);
            reload();
          }}
        />
      )}
    </>
  );
}
