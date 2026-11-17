import { Bell, CheckCircle, Lightning, XCircle, UserPlus, Warning, Prohibit } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Screen } from './Tabs';
import { EmptyState } from '../components/EmptyState';
import { DallahArt } from '../components/Art';
import { NeedsAccount } from '../components/account';
import { ErrorNote, Skeleton } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { useAction, useAsync } from '../lib/useAsync';
import { listInbox, markRead, type InboxKind, type InboxRow } from '../lib/api';
import { href, hrefFor } from '../lib/router';

const ICON: Record<InboxKind, Icon> = {
  request: UserPlus,
  approved: CheckCircle,
  declined: XCircle,
  auto_approved: CheckCircle,
  cancelled: Prohibit,
  need_one: Lightning,
  no_show: Warning,
};

/** Where an inbox item leads: hosts to their board, guests to the diwaniya page. */
export function inboxTarget(i: Pick<InboxRow, 'kind' | 'diwaniya_id'>): string {
  if (i.kind === 'request' || i.kind === 'auto_approved' || i.kind === 'cancelled') return hrefFor('diwaniya');
  return i.diwaniya_id ? href.place(i.diwaniya_id) : hrefFor('tonight');
}

/** S13 Inbox: requests, approvals, 'need one' pings and no-show marks, newest first. */
export function Inbox() {
  const { t } = usePrefs();
  return (
    <Screen title={t.inbox.title}>
      <NeedsAccount>
        <InboxBody />
      </NeedsAccount>
    </Screen>
  );
}

function InboxBody() {
  const { t, c, fmt, time, date, err } = usePrefs();
  const items = useAsync(listInbox, [], ['inbox']);
  const act = useAction();
  if (items.loading && !items.data) return <Skeleton rows={3} />;
  if (items.error != null && !items.data) return <ErrorNote text={err(items.error)} onRetry={items.reload} />;
  const list = items.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        art={<DallahArt />}
        title={t.inbox.emptyTitle}
        body={t.inbox.emptyBody}
        actions={[{ label: t.inbox.enable, href: hrefFor('me'), primary: true }]}
      />
    );
  }
  const unread = list.filter((i) => !i.read_at);
  const today = new Date().toDateString();
  return (
    <>
      <div className="row row--between">
        <p className="count-line" aria-live="polite">
          {c.inbox.unread(unread.length, fmt)}
        </p>
        {unread.length > 0 && (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            disabled={act.busy}
            onClick={() =>
              void act.run(async () => {
                await markRead(unread.map((i) => i.id));
                items.reload();
              })
            }
          >
            {c.inbox.markAll}
          </button>
        )}
      </div>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      <ul className="inbox">
        {list.map((i) => {
          const Glyph = ICON[i.kind] ?? Bell;
          return (
            <li key={i.id}>
              <a
                className={i.read_at ? 'inbox__item' : 'inbox__item inbox__item--unread'}
                href={inboxTarget(i)}
                onClick={() => {
                  if (!i.read_at) void markRead([i.id]);
                }}
              >
                <span className={`inbox__icon inbox__icon--${i.kind}`}>
                  <Glyph size={22} weight="fill" aria-hidden="true" />
                </span>
                <span className="inbox__text">
                  <bdi>{c.inbox.kinds[i.kind](i.diwaniya?.name ?? t.appName)}</bdi>
                  <span className="muted small">
                    {new Date(i.created_at).toDateString() === today ? time(i.created_at) : date(i.created_at)}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}
