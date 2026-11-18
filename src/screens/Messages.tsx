import { useEffect, useRef, useState } from 'react';
import { ChatsCircle, Flag, PaperPlaneRight, Prohibit, BellSlash } from '@phosphor-icons/react';
import { PushBar, ErrorNote, Field, OkNote, Skeleton } from '../components/ui';
import { NeedsAccount } from '../components/account';
import { EmptyState } from '../components/EmptyState';
import { DallahArt } from '../components/Art';
import { ReportSheet } from './Place';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { useAction, useAsync } from '../lib/useAsync';
import {
  MESSAGE_MAX,
  getDiwaniya,
  markThreadRead,
  myThreads,
  sendMessage,
  startThread,
  threadMessages,
  threadWith,
  type MessageRow,
  type ThreadSummary,
} from '../lib/api';
import { href, hrefFor } from '../lib/router';

/** Messages (Ali's change list 3, item 2): every conversation with a host, newest first. */
export function Messages() {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.messages.title} parent={hrefFor('tonight')} />
      <div className="screen__body">
        <NeedsAccount>
          <ThreadList />
        </NeedsAccount>
      </div>
    </>
  );
}

/** Who the other side is, as a line: guests see "Host of X", hosts see "Name · X". */
export function threadTitle(t: Pick<ThreadSummary, 'role' | 'other_name' | 'diwaniya_name'>, c: ReturnType<typeof usePrefs>['c']): string {
  return t.role === 'guest' ? c.messages.withHost(t.diwaniya_name) : c.messages.withGuest(t.other_name, t.diwaniya_name);
}

function ThreadList() {
  const { c, fmt, time, date, err } = usePrefs();
  const list = useAsync(myThreads, [], ['messages', 'message_threads']);
  if (list.loading && !list.data) return <Skeleton rows={3} />;
  if (list.error != null && !list.data) return <ErrorNote text={err(list.error)} onRetry={list.reload} />;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return <EmptyState art={<DallahArt />} title={c.messages.emptyTitle} body={c.messages.emptyBody} actions={[{ label: c.messages.toTonight, href: hrefFor('tonight'), primary: true }]} />;
  }
  const today = new Date().toDateString();
  return (
    <ul className="threads">
      {rows.map((t) => (
        <li key={t.id}>
          <a className={t.unread > 0 ? 'thread-row thread-row--unread' : 'thread-row'} href={href.thread(t.id)}>
            <span className="thread-row__icon" aria-hidden="true">
              <ChatsCircle size={22} weight={t.unread > 0 ? 'fill' : 'regular'} />
            </span>
            <span className="thread-row__text">
              <span className="thread-row__who">
                <bdi>{threadTitle(t, c)}</bdi>
              </span>
              {t.last_body && (
                <span className="thread-row__last">
                  {t.last_mine ? c.messages.you : ''}
                  <bdi>{t.last_body}</bdi>
                </span>
              )}
            </span>
            <span className="thread-row__side">
              <span className="muted small">{new Date(t.last_at).toDateString() === today ? time(t.last_at) : date(t.last_at)}</span>
              {t.unread > 0 && <span className="tag tag--saffron">{c.messages.unread(t.unread, fmt)}</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** One conversation. Realtime keeps it live; opening it marks the other side's words read. */
export function Thread({ id }: { id: string }) {
  const { c } = usePrefs();
  const head = useAsync(async () => (await myThreads()).find((t) => t.id === id) ?? null, [id], ['message_threads']);
  const title = head.data ? threadTitle(head.data, c) : c.messages.title;
  return (
    <>
      <PushBar title={title} parent={hrefFor('messages')} />
      <div className="screen__body screen__body--chat">
        <NeedsAccount>
          {head.loading && !head.data ? (
            <Skeleton rows={2} />
          ) : !head.data ? (
            <ErrorNote text={c.errors.notFound} />
          ) : (
            <Conversation thread={head.data} onChange={head.reload} />
          )}
        </NeedsAccount>
      </div>
    </>
  );
}

function Conversation({ thread, onChange }: { thread: ThreadSummary; onChange: () => void }) {
  const { c, time, err } = usePrefs();
  const { userId } = useSession();
  const msgs = useAsync(() => threadMessages(thread.id), [thread.id], ['messages']);
  const [reporting, setReporting] = useState<MessageRow | null>(null);
  const [notice, setNotice] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const list = msgs.data ?? [];
  const unreadTheirs = list.some((m) => m.sender_id !== userId && !m.read_at);

  useEffect(() => {
    if (unreadTheirs) void markThreadRead(thread.id).then(onChange, () => {});
  }, [unreadTheirs, thread.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView?.({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
  }, [list.length]);

  const canWrite = !thread.blocked && (thread.role === 'host' || thread.open);
  return (
    <div className="chat">
      <p className="muted small chat__safety">{c.messages.safety}</p>
      {msgs.error != null && !msgs.data && <ErrorNote text={err(msgs.error)} onRetry={msgs.reload} />}
      {notice && <OkNote text={notice} />}
      <ol className="chat__list" aria-live="polite">
        {list.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <li key={m.id} className={mine ? 'bubble bubble--mine' : 'bubble'}>
              <p className="bubble__body">
                <bdi>{m.body}</bdi>
              </p>
              <span className="bubble__meta">
                <span>{time(m.created_at)}</span>
                {mine && m.read_at && <span>· {c.messages.seen}</span>}
                {!mine && (
                  <button type="button" className="bubble__report" onClick={() => setReporting(m)}>
                    <Flag size={14} aria-hidden="true" />
                    {c.messages.report}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <div ref={end} />
      {thread.blocked ? (
        <p className="note note--info chat__closed">
          <Prohibit size={20} aria-hidden="true" />
          <span>{c.messages.blocked}</span>
        </p>
      ) : !thread.open ? (
        <p className="note note--info chat__closed">
          <BellSlash size={20} aria-hidden="true" />
          <span>{thread.role === 'host' ? c.messages.hostOffMine : c.messages.hostOff}</span>
        </p>
      ) : null}
      {canWrite && (
        <Composer
          onSend={async (body) => {
            await sendMessage(thread.id, body);
            msgs.reload();
            onChange();
          }}
        />
      )}
      {reporting && (
        <ReportSheet
          title={c.messages.reportTitle}
          quote={reporting.body}
          target={{ message: reporting.id }}
          onClose={() => setReporting(null)}
          onSent={() => setNotice(c.messages.reported)}
        />
      )}
    </div>
  );
}

/** The writing box: Enter makes a new line; the Send button sends. */
export function Composer({ onSend, note }: { onSend: (body: string) => Promise<void>; note?: string }) {
  const { c, fmt, err } = usePrefs();
  const act = useAction();
  const [text, setText] = useState('');
  const left = MESSAGE_MAX - text.length;
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;
        void act.run(async () => {
          await onSend(body);
          setText('');
        });
      }}
    >
      {note && <p className="muted small">{note}</p>}
      <Field label={c.messages.label} hint={left < 200 ? c.messages.left(left, fmt) : undefined}>
        <textarea
          className="input composer__input"
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={c.messages.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter makes a new line; Ctrl/Cmd+Enter sends, as in most chat apps.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
      </Field>
      {act.error != null && <ErrorNote text={err(act.error)} />}
      <button className="btn btn--primary composer__send" disabled={act.busy || text.trim() === ''}>
        <PaperPlaneRight size={18} aria-hidden="true" className="flip-rtl" />
        {c.messages.send}
      </button>
    </form>
  );
}

/** "Message host" from a diwaniya page: the existing conversation, or the first message. */
export function Dm({ id }: { id: string }) {
  const { c } = usePrefs();
  return (
    <>
      <PushBar title={c.messages.toHost} parent={href.place(id)} />
      <div className="screen__body screen__body--chat">
        <NeedsAccount>
          <DmBody id={id} />
        </NeedsAccount>
      </div>
    </>
  );
}

function DmBody({ id }: { id: string }) {
  const { c, err } = usePrefs();
  const info = useAsync(async () => {
    const [dw, existing] = await Promise.all([getDiwaniya(id), threadWith(id)]);
    return { dw, existing };
  }, [id]);
  useEffect(() => {
    // replace, so Back from the conversation returns to the diwaniya page, not to this hop
    if (info.data?.existing) window.location.replace(href.thread(info.data.existing));
  }, [info.data?.existing]);
  if (info.loading && !info.data) return <Skeleton rows={2} />;
  if (info.error != null && !info.data) return <ErrorNote text={err(info.error)} onRetry={info.reload} />;
  const dw = info.data?.dw;
  if (!dw) return <ErrorNote text={c.errors.notFound} />;
  if (info.data?.existing) return <Skeleton rows={2} />;
  return (
    <div className="chat">
      <h2 className="section-title">
        <bdi>{c.messages.withHost(dw.name)}</bdi>
      </h2>
      <p className="muted small chat__safety">{c.messages.safety}</p>
      {!dw.messages_on ? (
        <p className="note note--info chat__closed">
          <BellSlash size={20} aria-hidden="true" />
          <span>{c.messages.hostOff}</span>
        </p>
      ) : (
        <Composer
          note={c.messages.firstNote}
          onSend={async (body) => {
            const thread = await startThread(id, body);
            window.location.replace(href.thread(thread));
          }}
        />
      )}
    </div>
  );
}

