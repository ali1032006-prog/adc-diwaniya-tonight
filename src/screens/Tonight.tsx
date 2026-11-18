import { useEffect, useMemo, useState } from 'react';
import { Lightning, UsersThree, Armchair, FunnelSimple } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { RequestSheet } from './Place';
import { EmptyState } from '../components/EmptyState';
import { SeatRing } from '../components/SeatRing';
import { TableRing, NeedsAccount } from '../components/account';
import { ErrorNote, OkNote, Sheet, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import { GOVERNORATES, areaLabel, areaValue, governorateLabel, governorateOf } from '../lib/areas';
import { ApiError, GAMES, checkIn, getOpenNight, listTonight, myDiwaniyaList, openSeats, type Game, type MyDiwaniya, type NightRow } from '../lib/api';
import { href, hrefFor } from '../lib/router';

/** Where to look (ADC-LOG-794 item 4): all of Kuwait, one governorate, or one area. */
export type Where = 'all' | `gov:${string}` | `area:${string}`;
const WHERE_KEY = 'dt.tonight.where.v1';
const GAMES_KEY = 'dt.tonight.games.v1';

function whereOk(v: string | null): v is Where {
  return v === 'all' || /^gov:[a-z]+$/.test(v ?? '') || /^area:.+$/.test(v ?? '');
}

/** Filter tonight's nights by place (governorate or area) and by game. */
export function filterNights(nights: NightRow[], games: Game[], where: Where = 'all'): NightRow[] {
  return nights
    .filter((n) => {
      if (where === 'all') return true;
      if (where.startsWith('gov:')) return governorateOf(n.diwaniya?.area) === where.slice(4);
      return areaValue(n.diwaniya?.area) === areaValue(where.slice(5));
    })
    .map((n) => ({ ...n, tables: games.length ? n.tables.filter((t) => games.includes(t.game)) : n.tables }))
    .filter((n) => n.tables.length > 0 || games.length === 0);
}

/** How many filters are on, for the Filter button's badge: the place counts once, each game once. */
export function filterCount(where: Where, games: Game[]): number {
  return (where === 'all' ? 0 : 1) + games.length;
}

/** The location filter in the sheet: all of Kuwait, or a kind (governorate / area) then which one. */
export type Scope = 'all' | 'gov' | 'area';
export function scopeOf(where: Where): Scope {
  return where === 'all' ? 'all' : where.startsWith('gov:') ? 'gov' : 'area';
}

/** How many of tonight's nights sit in each governorate key and each area value. */
export function nightCounts(nights: NightRow[]): { gov: Map<string, number>; area: Map<string, number> } {
  const gov = new Map<string, number>();
  const area = new Map<string, number>();
  for (const n of nights) {
    const g = governorateOf(n.diwaniya?.area);
    const a = areaValue(n.diwaniya?.area);
    if (g) gov.set(g, (gov.get(g) ?? 0) + 1);
    if (a) area.set(a, (area.get(a) ?? 0) + 1);
  }
  return { gov, area };
}

function readGames(): Game[] {
  try {
    const v = JSON.parse(localStorage.getItem(GAMES_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? GAMES.filter((g) => v.includes(g)) : [];
  } catch {
    return [];
  }
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
  const { userId } = useSession();
  const nights = useAsync(listTonight, [], ['nights', 'game_tables', 'seats']);
  const mine = useAsync(myDiwaniyaList, [], ['requests', 'seats']);
  const [games, setGames] = useState<Game[]>(readGames);
  const [where, setWhere] = useState<Where>(() => {
    const v = localStorage.getItem(WHERE_KEY);
    return whereOk(v) ? v : 'all';
  });
  const [filtering, setFiltering] = useState(false);
  const [asking, setAsking] = useState<NightRow | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => localStorage.setItem(WHERE_KEY, where), [where]);
  useEffect(() => localStorage.setItem(GAMES_KEY, JSON.stringify(games)), [games]);
  const shown = useMemo(() => filterNights(nights.data ?? [], games, where), [nights.data, games, where]);
  const on = filterCount(where, games);
  const summary = [
    where === 'all' ? '' : where.startsWith('gov:') ? governorateLabel(where.slice(4), prefs.lang) : areaLabel(where.slice(5), prefs.lang),
    ...games.map((g) => t.games[g]),
  ].filter(Boolean);
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
          {/* Ali's change list 5 item 1 (ADC-LOG-806): one Filter button, the choices live in its sheet. */}
          <div className="filter-bar">
            <button
              type="button"
              className={on ? 'btn btn--quiet filter-btn filter-btn--on' : 'btn btn--quiet filter-btn'}
              aria-haspopup="dialog"
              aria-label={on ? c.tonight.filterOn(fmt(on)) : c.tonight.filter}
              onClick={() => setFiltering(true)}
            >
              <FunnelSimple size={20} aria-hidden="true" />
              <span>{c.tonight.filter}</span>
              {on > 0 && (
                <span className="filter-btn__badge" key={on} aria-hidden="true">
                  {fmt(on)}
                </span>
              )}
            </button>
            {summary.length > 0 && (
              <p className="filter-bar__summary muted small">
                <bdi>{summary.join(prefs.lang === 'ar' ? '، ' : ', ')}</bdi>
              </p>
            )}
          </div>
          <p className="count-line" aria-live="polite">
            {c.tonight.live(shown.length, fmt)}
          </p>
          {shown.length === 0 ? (
            <div className="empty empty--inline">
              <p className="empty__title">{c.tonight.noMatch}</p>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  setGames([]);
                  setWhere('all');
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
      {filtering && (
        <FilterSheet
          nights={all}
          where={where}
          games={games}
          onClose={() => setFiltering(false)}
          onApply={(w, g) => {
            setWhere(w);
            setGames(g);
            setFiltering(false);
          }}
        />
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

/**
 * The Filter sheet (ADC-LOG-806): a Location part (All of Kuwait, a Governorate, or an Area, then
 * which one) and a Game part (every game the app knows, not only tonight's). Nothing changes on
 * the page until Apply; the red Clear empties both parts and applies at once.
 */
export function FilterSheet({
  nights,
  where,
  games,
  onClose,
  onApply,
}: {
  nights: NightRow[];
  where: Where;
  games: Game[];
  onClose: () => void;
  onApply: (where: Where, games: Game[]) => void;
}) {
  const { c, t, fmt, prefs } = usePrefs();
  const [scope, setScope] = useState<Scope>(scopeOf(where));
  const [gov, setGov] = useState(where.startsWith('gov:') ? where.slice(4) : '');
  const [area, setArea] = useState(where.startsWith('area:') ? areaValue(where.slice(5)) || where.slice(5) : '');
  const [picked, setPicked] = useState<Game[]>(games);
  const counts = useMemo(() => nightCounts(nights), [nights]);
  const draft: Where | null = scope === 'all' ? 'all' : scope === 'gov' ? (gov ? `gov:${gov}` : null) : area ? `area:${area}` : null;
  const preview = draft ? filterNights(nights, picked, draft).length : null;
  const n = (k: number) => (k > 0 ? ` (${fmt(k)})` : '');
  const name = (o: { ar: string; en: string }) => (prefs.lang === 'en' ? o.en : o.ar);
  const scopes: { v: Scope; label: string }[] = [
    { v: 'all', label: c.tonight.scopeAll },
    { v: 'gov', label: c.tonight.scopeGov },
    { v: 'area', label: c.tonight.scopeArea },
  ];
  const toggle = (g: Game) => setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : GAMES.filter((x) => x === g || p.includes(x))));
  return (
    <Sheet title={c.tonight.filter} onClose={onClose}>
      <form
        className="filter-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft) onApply(draft, picked);
        }}
      >
        <fieldset className="filter-sheet__part">
          <legend className="filter-sheet__head">{c.tonight.where}</legend>
          <div className="chips">
            {scopes.map((o) => (
              <label key={o.v} className="chip">
                <input type="radio" name="filter-scope" checked={scope === o.v} onChange={() => setScope(o.v)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          {scope === 'gov' && (
            <select className="input filter-sheet__pick" aria-label={c.tonight.scopeGov} value={gov} onChange={(e) => setGov(e.target.value)}>
              <option value="" disabled>
                {c.tonight.pickGov}
              </option>
              {GOVERNORATES.map((g) => (
                <option key={g.key} value={g.key}>
                  {name(g) + n(counts.gov.get(g.key) ?? 0)}
                </option>
              ))}
            </select>
          )}
          {scope === 'area' && (
            <select className="input filter-sheet__pick" aria-label={c.tonight.scopeArea} value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="" disabled>
                {c.areas.pick}
              </option>
              {GOVERNORATES.map((g) => (
                <optgroup key={g.key} label={name(g)}>
                  {g.areas.map((a) => (
                    <option key={a.ar} value={a.ar}>
                      {name(a) + n(counts.area.get(a.ar) ?? 0)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </fieldset>
        <fieldset className="filter-sheet__part">
          <legend className="filter-sheet__head">{c.tonight.game}</legend>
          <div className="chips">
            <label className="chip">
              <input type="checkbox" checked={picked.length === 0} onChange={() => setPicked([])} />
              <span>{c.tonight.allGames}</span>
            </label>
            {GAMES.map((g) => (
              <label key={g} className="chip">
                <input type="checkbox" checked={picked.includes(g)} onChange={() => toggle(g)} />
                <span>{t.games[g]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="filter-sheet__live muted small" aria-live="polite">
          {preview === null ? c.tonight.needPick : c.tonight.live(preview, fmt)}
        </p>
        <div className="filter-sheet__actions">
          <button type="button" className="btn btn--danger" onClick={() => onApply('all', [])}>
            {c.tonight.clearShort}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!draft}>
            {c.tonight.apply}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
