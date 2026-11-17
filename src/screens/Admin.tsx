import { useRef, useState } from 'react';
import { EyeSlash, Eye, Flag, ShieldCheck, Storefront, User } from '@phosphor-icons/react';
import { PushBar, ErrorNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { usePrefs } from '../lib/prefs';
import { useAction, useAsync } from '../lib/useAsync';
import {
  adminHidden,
  adminReports,
  adminReview,
  adminSummary,
  adminUnhide,
  amIAdmin,
  type HiddenThing,
  type QueueItem,
  type ReportReason,
  type ReportStatus,
  type ReviewAction,
} from '../lib/api';
import { href, hrefFor } from '../lib/router';

type View = ReportStatus | 'hidden' | 'summary';
const VIEWS: View[] = ['open', 'actioned', 'dismissed', 'hidden', 'summary'];

/**
 * Moderation queue for the app admin (Ali, ruling D, ADC-LOG-697): reports in, review with a note,
 * hide or bring back a player or a diwaniya, and the numbers for the written summary.
 * Every action is checked again on the server (admin RPCs refuse anyone else with 42501).
 */
export function Admin() {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.admin.title} parent={hrefFor('me')} />
      <div className="screen__body">
        <NeedsAccount>
          <AdminGate />
        </NeedsAccount>
      </div>
    </>
  );
}

function AdminGate() {
  const { c, err } = usePrefs();
  const admin = useAsync(amIAdmin, []);
  if (admin.loading && admin.data == null) return <Skeleton rows={1} />;
  if (admin.error != null) return <ErrorNote text={err(admin.error)} onRetry={admin.reload} />;
  if (!admin.data) {
    return (
      <div className="note note--info" role="status">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>{c.admin.notAdmin}</p>
      </div>
    );
  }
  return <AdminBody />;
}

function AdminBody() {
  const { c } = usePrefs();
  const [view, setView] = useState<View>('open');
  const strip = useRef<HTMLDivElement>(null);
  return (
    <div className="stack admin">
      <p className="muted small">{c.admin.rule}</p>
      <div className="tabs-row" role="tablist" aria-label={c.admin.title} ref={strip}>
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={view === v ? 'tab-chip tab-chip--on' : 'tab-chip'}
            onClick={(e) => {
              setView(v);
              // keep the chosen tab in view inside the strip on narrow screens
              e.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }}
          >
            {c.admin.tabs[v]}
          </button>
        ))}
      </div>
      <div role="tabpanel" key={view} className="admin__panel">
        {view === 'summary' ? <Summary /> : view === 'hidden' ? <Hidden /> : <Queue status={view} />}
      </div>
    </div>
  );
}

function Queue({ status }: { status: ReportStatus }) {
  const { c, err } = usePrefs();
  const list = useAsync(() => adminReports(status), [status]);
  if (list.loading && !list.data) return <Skeleton rows={2} />;
  if (list.error != null && !list.data) return <ErrorNote text={err(list.error)} onRetry={list.reload} />;
  const items = list.data ?? [];
  if (items.length === 0) return <p className="muted">{c.admin.empty}</p>;
  return (
    <ul className="report-list">
      {items.map((r) => (
        <li key={r.id}>
          <ReportCard item={r} onDone={list.reload} />
        </li>
      ))}
    </ul>
  );
}

function ReportCard({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const { c, fmt, date, time, err } = usePrefs();
  const act = useAction();
  const [note, setNote] = useState('');
  const [leaving, setLeaving] = useState(false);
  const run = (action: ReviewAction) => {
    if (action !== 'dismiss' && !window.confirm(c.admin.hideConfirm)) return;
    void act.run(async () => {
      await adminReview(item.id, action, note);
      // the reviewed card steps out of the queue before the list reloads
      setLeaving(true);
      await new Promise((r) => setTimeout(r, 180));
      onDone();
    });
  };
  const u = item.target_user;
  const d = item.target_diwaniya;
  const flags = (t: { hidden_at: string | null; held_at: string | null }) => (
    <>
      {t.hidden_at && <span className="tag tag--alert">{c.admin.hidden}</span>}
      {!t.hidden_at && t.held_at && <span className="tag tag--saffron">{c.admin.held}</span>}
    </>
  );
  return (
    <article className={leaving ? 'report-card report-card--leaving' : 'report-card'} aria-labelledby={`r-${item.id}`}>
      <header className="report-card__head">
        <Flag size={20} weight="fill" aria-hidden="true" className="report-card__icon" />
        <h2 id={`r-${item.id}`} className="report-card__reason">
          {c.report.reasons[item.reason as ReportReason]}
        </h2>
        <span className="muted small">
          {date(item.created_at)} · {time(item.created_at)}
        </span>
      </header>
      <dl className="report-card__facts">
        <div>
          <dt>{u ? c.admin.aboutUser : d ? c.admin.aboutDiwaniya : c.admin.deleted}</dt>
          <dd>
            {u ? (
              <a className="link" href={href.player(u.id)}>
                <User size={16} aria-hidden="true" /> <bdi>{u.name}</bdi>
              </a>
            ) : d ? (
              <a className="link" href={href.place(d.id)}>
                <Storefront size={16} aria-hidden="true" /> <bdi>{d.name}</bdi> · <bdi>{d.area}</bdi>
              </a>
            ) : (
              <bdi>{item.target_label || c.admin.deleted}</bdi>
            )}{' '}
            {u && flags(u)}
            {d && flags(d)}
          </dd>
        </div>
        {(u || d) && <p className="muted small">{c.admin.openCount((u ?? d)!.open_reports, fmt)}</p>}
        <p className="muted small">{c.admin.from(item.reporter?.name ?? c.admin.deleted)}</p>
      </dl>
      {item.details && (
        <blockquote className="report-card__details">
          <bdi>{item.details}</bdi>
        </blockquote>
      )}
      {item.status === 'open' ? (
        <>
          <label className="field">
            <span className="field__label">{c.admin.note}</span>
            <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {act.error != null && <ErrorNote text={err(act.error)} />}
          <div className="actions-row">
            <button type="button" className="btn btn--quiet btn--small" disabled={act.busy} onClick={() => run('dismiss')}>
              {c.admin.dismiss}
            </button>
            {u && (
              <button type="button" className="btn btn--danger btn--small" disabled={act.busy} onClick={() => run('hide_user')}>
                <EyeSlash size={18} aria-hidden="true" />
                {c.admin.hideUser}
              </button>
            )}
            {d && (
              <button type="button" className="btn btn--danger btn--small" disabled={act.busy} onClick={() => run('hide_diwaniya')}>
                <EyeSlash size={18} aria-hidden="true" />
                {c.admin.hideDiwaniya}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="muted small">
          {item.reviewed_at && c.admin.reviewed(date(item.reviewed_at))}
          {item.review_note && (
            <>
              {' · '}
              <bdi>{item.review_note}</bdi>
            </>
          )}
        </p>
      )}
    </article>
  );
}

function Hidden() {
  const { c, err } = usePrefs();
  const data = useAsync(adminHidden, []);
  const act = useAction();
  if (data.loading && !data.data) return <Skeleton rows={1} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const { users, diwaniyas } = data.data!;
  if (users.length === 0 && diwaniyas.length === 0) return <p className="muted">{c.admin.noHidden}</p>;
  const row = (t: HiddenThing, kind: 'user' | 'diwaniya') => (
    <li key={t.id} className="people__row">
      <a className="link" href={kind === 'user' ? href.player(t.id) : href.place(t.id)}>
        <bdi>{t.name}</bdi>
      </a>
      <span className={t.hidden_at ? 'tag tag--alert' : 'tag tag--saffron'}>{t.hidden_at ? c.admin.hidden : c.admin.held}</span>
      <button
        type="button"
        className="btn btn--text btn--small"
        disabled={act.busy}
        onClick={() =>
          void act.run(async () => {
            await adminUnhide(kind === 'user' ? { user: t.id } : { diwaniya: t.id }, '');
            data.reload();
          })
        }
      >
        <Eye size={18} aria-hidden="true" />
        {c.admin.unhide}
      </button>
    </li>
  );
  return (
    <div className="stack">
      {act.error != null && <ErrorNote text={err(act.error)} />}
      {users.length > 0 && (
        <section className="panel" aria-labelledby="hid-u">
          <h2 id="hid-u" className="panel__title">
            {c.admin.users}
          </h2>
          <ul className="people">{users.map((u) => row(u, 'user'))}</ul>
        </section>
      )}
      {diwaniyas.length > 0 && (
        <section className="panel" aria-labelledby="hid-d">
          <h2 id="hid-d" className="panel__title">
            {c.admin.diwaniyas}
          </h2>
          <ul className="people">{diwaniyas.map((d) => row(d, 'diwaniya'))}</ul>
        </section>
      )}
    </div>
  );
}

function Summary() {
  const { c, fmt, err } = usePrefs();
  const data = useAsync(adminSummary, []);
  if (data.loading && !data.data) return <Skeleton rows={1} />;
  if (data.error != null && !data.data) return <ErrorNote text={err(data.error)} onRetry={data.reload} />;
  const s = data.data!;
  const stat = (label: string, n: number) => (
    <div className="stat">
      <span className="stat__num">{fmt(n)}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
  const reasons = Object.entries(s.open_by_reason) as [ReportReason, number][];
  return (
    <div className="stack">
      <section className="stats" aria-label={c.admin.tabs.summary}>
        {stat(c.admin.sum.open, s.open)}
        {stat(c.admin.sum.new7, s.new_7d)}
        {stat(c.admin.sum.reviewed7, s.reviewed_7d)}
        {stat(c.admin.sum.held, s.held_users + s.held_diwaniyas)}
        {stat(c.admin.sum.hidden, s.hidden_users + s.hidden_diwaniyas)}
        {stat(c.admin.sum.noShows, s.no_shows_7d)}
      </section>
      {reasons.length > 0 && (
        <section className="panel" aria-labelledby="sum-r">
          <h2 id="sum-r" className="panel__title">
            {c.admin.sum.byReason}
          </h2>
          <dl className="info">
            {reasons.map(([r, n]) => (
              <div key={r} className="info-row">
                <dt>{c.report.reasons[r]}</dt>
                <dd>{fmt(n)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
