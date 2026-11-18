import { useEffect, useState } from 'react';
import { List, Tray, ChatsCircle, CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Sheet } from './ui';
import { usePrefs } from '../lib/prefs';
import { useUnread } from '../lib/unread';
import { useSession } from '../lib/session';
import { go, hrefFor } from '../lib/router';

/**
 * The three-line button at the top of every page (Ali's change list 3, item 1). It opens a menu with
 * Inbox and Messages; a saffron badge on the button carries their unread total.
 */
export function TopMenu() {
  const { c, fmt } = usePrefs();
  const { status } = useSession();
  const { inbox, messages } = useUnread();
  const [open, setOpen] = useState(false);
  const total = inbox + messages;

  // Any navigation closes it (a link inside, the back gesture, a ping link).
  useEffect(() => {
    if (!open) return;
    const on = () => setOpen(false);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [open]);

  // Close first (the sheet pops its own history entry), then go, so Back returns to the page.
  const to = (target: string) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', finish);
      go(target);
    };
    window.addEventListener('popstate', finish);
    setTimeout(finish, 350);
    setOpen(false);
  };

  // Hooks above run every render; the button itself is only for signed-in people with a profile.
  if (status !== 'ready') return null;

  return (
    <>
      <button
        type="button"
        className="icon-btn top-menu"
        aria-label={c.topMenu.button + c.topMenu.unread(total, fmt)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <List size={24} aria-hidden="true" />
        {total > 0 && (
          <span className="top-menu__badge" aria-hidden="true">
            {fmt(Math.min(total, 99))}
          </span>
        )}
      </button>
      {open && (
        <Sheet title={c.topMenu.title} onClose={() => setOpen(false)}>
          <ul className="menu">
            <MenuLink icon={Tray} title={c.topMenu.inbox} sub={c.topMenu.inboxSub} count={inbox} onGo={() => to(hrefFor('inbox'))} />
            <MenuLink icon={ChatsCircle} title={c.topMenu.messages} sub={c.topMenu.messagesSub} count={messages} onGo={() => to(hrefFor('messages'))} />
          </ul>
        </Sheet>
      )}
    </>
  );
}

function MenuLink({ icon: I, title, sub, count, onGo }: { icon: Icon; title: string; sub: string; count: number; onGo: () => void }) {
  const { prefs, fmt, c } = usePrefs();
  const Caret = prefs.lang === 'ar' ? CaretLeft : CaretRight;
  return (
    <li>
      <button type="button" className="menu-row menu-row--button" onClick={onGo}>
        <span className="menu-row__icon">
          <I size={22} aria-hidden="true" />
        </span>
        <span className="menu-row__text">
          <span className="menu-row__title">{title}</span>
          <span className="menu-row__sub">{sub}</span>
        </span>
        {count > 0 && (
          <span className="tag tag--saffron menu-row__count">
            {fmt(Math.min(count, 99))}
            <span className="visually-hidden">{c.topMenu.unread(count, fmt)}</span>
          </span>
        )}
        <Caret size={18} aria-hidden="true" className="menu-row__caret" />
      </button>
    </li>
  );
}
