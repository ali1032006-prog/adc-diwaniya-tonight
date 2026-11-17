import { useMemo, useState } from 'react';
import { Lightning, UsersThree } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { EmptyState } from '../components/EmptyState';
import { SeatRing } from '../components/SeatRing';
import { TableRing, NeedsAccount } from '../components/account';
import { Chips, ErrorNote, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAsync } from '../lib/useAsync';
import { GAMES, listTonight, openSeats, type Game, type NightRow } from '../lib/api';
import { href, hrefFor } from '../lib/router';

/** Filter tonight's nights by game and by whether a seat is still open. */
export function filterNights(nights: NightRow[], games: Game[], openOnly: boolean): NightRow[] {
  return nights
    .map((n) => ({ ...n, tables: games.length ? n.tables.filter((t) => games.includes(t.game)) : n.tables }))
    .filter((n) => n.tables.length > 0 || games.length === 0)
    .filter((n) => !openOnly || n.tables.some((t) => openSeats(t) > 0));
}

/** S5 Tonight: diwaniyas open tonight, each led by its seat rings. */
export function Tonight() {
  const { t } = usePrefs();
  return (
    <Screen title={t.tonight.title}>
      <NeedsAccountOrTeach>
        <TonightList />
      </NeedsAccountOrTeach>
    </Screen>
  );
}

/** Signed out, Tonight still teaches what it will show, then offers the gate. */
function NeedsAccountOrTeach({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const { t, c } = usePrefs();
  if (status === 'signedOut' || status === 'offline') {
    return (
      <EmptyState
        art={<SeatRing game="kout" seats={[null, null, null, null, null, null]} size={132} decorative />}
        title={c.tonight.guestTitle}
        body={c.tonight.guestBody}
        actions={[
          { label: c.gate.signIn, href: href.signin('signin', 'tonight'), primary: true },
          { label: t.tonight.openYours, href: hrefFor('diwaniya') },
        ]}
      />
    );
  }
  return <NeedsAccount>{children}</NeedsAccount>;
}

function TonightList() {
  const { t, c, fmt, time, err } = usePrefs();
  const nights = useAsync(listTonight, [], ['nights', 'game_tables', 'seats']);
  const [games, setGames] = useState<Game[]>([]);
  const [openOnly, setOpenOnly] = useState(false);
  const shown = useMemo(() => filterNights(nights.data ?? [], games, openOnly), [nights.data, games, openOnly]);

  if (nights.loading && !nights.data) return <Skeleton rows={3} />;
  if (nights.error != null && !nights.data) return <ErrorNote text={err(nights.error)} onRetry={nights.reload} />;
  const all = nights.data ?? [];
  if (all.length === 0) {
    return (
      <EmptyState
        art={<SeatRing game="kout" seats={[null, null, null, null, null, null]} size={132} decorative />}
        title={t.tonight.emptyTitle}
        body={t.tonight.emptyBody}
        actions={[
          { label: c.gate.signIn, href: href.signin('signin', 'tonight'), primary: true },
          { label: t.tonight.openYours, href: hrefFor('diwaniya') },
        ]}
      />
    );
  }
  return (
    <>
      <div className="filters" role="group" aria-label={c.tonight.filterLabel}>
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
          <p className="empty__title">{c.tonight.noMatch}</p>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              setGames([]);
              setOpenOnly(false);
            }}
          >
            {c.tonight.clear}
          </button>
        </div>
      ) : (
        <ul className="cards">
          {shown.map((n, i) => (
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
                    <bdi>{n.diwaniya?.area}</bdi> · {c.tonight.starts(time(n.starts_at))}
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
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
