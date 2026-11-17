import { useState } from 'react';
import { Flag, Prohibit, UserGear } from '@phosphor-icons/react';
import { PushBar, ErrorNote, OkNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { ReportSheet } from './Place';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import { addCohost, block, getPlayer, myDiwaniyas } from '../lib/api';
import { hrefFor } from '../lib/router';

/** S12 Player profile: games, reliability (shows vs no-shows), block and report. */
export function Player({ id }: { id: string }) {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.player.title} parent={hrefFor('league')} />
      <div className="screen__body">
        <NeedsAccount>
          <PlayerBody id={id} />
        </NeedsAccount>
      </div>
    </>
  );
}

function PlayerBody({ id }: { id: string }) {
  const { c, t, fmt, date, err } = usePrefs();
  const { userId } = useSession();
  const data = useAsync(async () => ({ ...(await getPlayer(id)), mine: await myDiwaniyas() }), [id]);
  const act = useAction();
  const [notice, setNotice] = useState('');
  const [reporting, setReporting] = useState(false);
  if (data.loading && !data.data) return <Skeleton rows={1} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const { profile, stats, mine } = data.data!;
  if (!profile) return <ErrorNote text={c.errors.notFound} />;
  const self = profile.id === userId;
  const hosted = mine.filter((d) => d.host_id === userId);
  const stat = (label: string, n: number) => (
    <div className="stat">
      <span className="stat__num">{fmt(n)}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
  return (
    <div className="stack">
      <section className="player-head">
        <h2 className="place__name">
          <bdi>{profile.display_name}</bdi>
        </h2>
        <p className="muted">
          <bdi>{profile.area}</bdi> · {c.player.since(date(profile.created_at))}
        </p>
        {profile.games.length > 0 && (
          <p className="night-card__tags">
            {profile.games.map((g) => (
              <span key={g} className="tag tag--camel">
                {t.games[g]}
              </span>
            ))}
          </p>
        )}
      </section>
      <section className="stats" aria-label={c.player.title}>
        {stat(c.player.nights, stats.nights_shown)}
        {stat(c.player.noShows, stats.no_shows)}
        {stat(c.player.games, stats.games)}
        {stat(c.player.wins, stats.wins)}
      </section>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {notice && <OkNote text={notice} />}
      {!self && (
        <div className="row">
          {hosted.map((d) => (
            <button
              key={d.id}
              type="button"
              className="btn btn--quiet btn--small"
              disabled={act.busy}
              onClick={() => void act.run(async () => {
                await addCohost(d.id, profile.id);
                setNotice(c.common.saved);
              })}
            >
              <UserGear size={18} aria-hidden="true" />
              {c.player.makeCohost} · <bdi>{d.name}</bdi>
            </button>
          ))}
          <button
            type="button"
            className="btn btn--quiet btn--small"
            disabled={act.busy}
            onClick={() =>
              window.confirm(c.player.blockConfirm) &&
              void act.run(async () => {
                await block(profile.id);
                setNotice(c.player.blocked);
              })
            }
          >
            <Prohibit size={18} aria-hidden="true" />
            {c.player.block}
          </button>
          <button type="button" className="btn btn--text btn--small" onClick={() => setReporting(true)}>
            <Flag size={18} aria-hidden="true" />
            {c.player.report}
          </button>
        </div>
      )}
      {reporting && <ReportSheet target={{ user: profile.id }} onClose={() => setReporting(false)} onSent={() => setNotice(c.report.sent)} />}
    </div>
  );
}
