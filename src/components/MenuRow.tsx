import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { usePrefs } from '../lib/prefs';

/** One row of a settings menu: icon, title, one line of what is inside, and the caret. */
export function MenuRow({ href: to, icon: I, title, sub, danger }: { href: string; icon: Icon; title: string; sub: string; danger?: boolean }) {
  const { prefs } = usePrefs();
  const Caret = prefs.lang === 'ar' ? CaretLeft : CaretRight;
  return (
    <li>
      <a className={danger ? 'menu-row menu-row--danger' : 'menu-row'} href={to}>
        <span className="menu-row__icon">
          <I size={22} aria-hidden="true" />
        </span>
        <span className="menu-row__text">
          <span className="menu-row__title">{title}</span>
          <span className="menu-row__sub">{sub}</span>
        </span>
        <Caret size={18} aria-hidden="true" className="menu-row__caret" />
      </a>
    </li>
  );
}
