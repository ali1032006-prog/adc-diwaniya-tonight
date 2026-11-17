import { useEffect, useState } from 'react';
import { MoonStars, Armchair, Trophy, Tray, UserCircle, type Icon } from '@phosphor-icons/react';
import { TABS, hrefFor, type Tab } from '../lib/router';
import { usePrefs } from '../lib/prefs';

const ICONS: Record<Tab, Icon> = {
  tonight: MoonStars,
  diwaniya: Armchair,
  league: Trophy,
  inbox: Tray,
  me: UserCircle,
};

function useReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(q);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * One navigation layer: a bottom bar on phones and tablets, a rail on wide or short-landscape
 * windows (CSS decides). A single pill slides to the active tab with transform only; with reduced
 * motion it is re-mounted at the new tab and fades in instead.
 */
export function NavBar({ active, onReselect, inboxCount = 0 }: { active: Tab; onReselect: (tab: Tab) => void; inboxCount?: number }) {
  const { t, fmt } = usePrefs();
  const reduced = useReducedMotion();
  const index = TABS.indexOf(active);
  return (
    <nav className="nav" aria-label={t.navLabel}>
      <div className="nav__track" style={{ ['--i' as string]: index }}>
        <span key={reduced ? `pill-${index}` : 'pill'} className="nav__pill-slot" aria-hidden="true">
          <span className="nav__pill" />
        </span>
        {TABS.map((tab) => {
          const Glyph = ICONS[tab];
          const current = tab === active;
          return (
            <a
              key={tab}
              className="nav__item"
              href={hrefFor(tab)}
              aria-current={current ? 'page' : undefined}
              onClick={() => current && onReselect(tab)}
            >
              <span className="nav__icon">
                <Glyph size={24} weight={current ? 'fill' : 'regular'} aria-hidden="true" />
                {tab === 'inbox' && inboxCount > 0 && (
                  <span className="nav__badge">
                    <span aria-hidden="true">{fmt(Math.min(inboxCount, 99))}</span>
                    <span className="visually-hidden">{`, ${inboxCount}`}</span>
                  </span>
                )}
              </span>
              <span className="nav__label">{t.tabs[tab]}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
