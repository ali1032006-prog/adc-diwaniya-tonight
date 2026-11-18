import { useEffect, useState } from 'react';
import type { Game } from './api';

export const TABS = ['tonight', 'diwaniya', 'league', 'inbox', 'me'] as const;
export type Tab = (typeof TABS)[number];

export type Route =
  | { name: Exclude<Tab, 'me'> }
  | { name: 'me'; section?: MeSection } // S14 Me: a menu; each button opens its section (ADC-LOG-764 item 7)
  | { name: 'welcome'; from?: string } // S1, shown once right after the first sign-in (ADC-LOG-764 item 5)
  | { name: 'guides'; game: Game; view: 'score' | 'rules' } // game guides (ADC-LOG-764 item 4)
  | { name: 'signin'; mode: 'signin' | 'register'; from?: string } // S2 Sign in and Register (Google only)
  | { name: 'terms' } // Terms and Privacy (ruling C: men only, ruling B: 18+)
  | { name: 'pings' } // S4 Install and pings guide
  | { name: 'admin' } // moderation queue, Ali's admin role (ruling D)
  | { name: 'place'; id: string } // S6 Diwaniya page (pushed from Tonight, Diwaniya or Inbox)
  | { name: 'settings'; id: string; section?: SettingsSection } // S9 Diwaniya settings: a menu, then one section
  | { name: 'score'; id: string; table?: string } // S10 Score a game (full screen)
  | { name: 'player'; id: string }; // S12 Player profile

export const ME_SECTIONS = ['prefs', 'account', 'pings', 'privacy', 'data', 'delete'] as const;
export type MeSection = (typeof ME_SECTIONS)[number];
export const SETTINGS_SECTIONS = ['basics', 'page', 'joining', 'location', 'people'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
const GUIDE_GAMES: readonly Game[] = ['kout', 'baloot', 'tarneeb', 'trix'];
const FROM = /^[a-z]+(\/[0-9a-f-]{36})?$/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse a hash like "#/league" or "#/d/<uuid>" into a route; anything unknown or malformed goes to Tonight. */
export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const head = parts[0] ?? '';
  const id = parts[1] ?? '';
  if (head === 'welcome') {
    const from = new URLSearchParams(query).get('from') ?? '';
    return FROM.test(from) && !from.startsWith('signin') && !from.startsWith('welcome') ? { name: 'welcome', from } : { name: 'welcome' };
  }
  if (head === 'guides') {
    const q = new URLSearchParams(query);
    const game = (GUIDE_GAMES as readonly string[]).includes(q.get('game') ?? '') ? (q.get('game') as Game) : 'kout';
    return { name: 'guides', game, view: q.get('view') === 'rules' ? 'rules' : 'score' };
  }
  if (head === 'me') {
    return (ME_SECTIONS as readonly string[]).includes(id) ? { name: 'me', section: id as MeSection } : { name: 'me' };
  }
  if (head === 'terms') return { name: 'terms' };
  if (head === 'pings') return { name: 'pings' };
  if (head === 'admin') return { name: 'admin' };
  if (head === 'signin') {
    const q = new URLSearchParams(query);
    const from = q.get('from') ?? undefined;
    return { name: 'signin', mode: q.get('mode') === 'register' ? 'register' : 'signin', ...(from && /^[a-z]+(\/[0-9a-f-]{36})?$/i.test(from) ? { from } : {}) };
  }
  if (UUID.test(id)) {
    if (head === 'd') return { name: 'place', id };
    if (head === 'settings') {
      const sec = parts[2] ?? '';
      return (SETTINGS_SECTIONS as readonly string[]).includes(sec) ? { name: 'settings', id, section: sec as SettingsSection } : { name: 'settings', id };
    }
    if (head === 'player') return { name: 'player', id };
    if (head === 'score') {
      const table = new URLSearchParams(query).get('table');
      return table && UUID.test(table) ? { name: 'score', id, table } : { name: 'score', id };
    }
  }
  return { name: (TABS as readonly string[]).includes(head) && head !== 'me' ? (head as Exclude<Tab, 'me'>) : 'tonight' };
}

export function hrefFor(name: Tab | 'welcome' | 'terms' | 'pings' | 'admin'): string {
  return `#/${name}`;
}

export const href = {
  place: (id: string) => `#/d/${id}`,
  settings: (id: string, section?: SettingsSection) => (section ? `#/settings/${id}/${section}` : `#/settings/${id}`),
  me: (section?: MeSection) => (section ? `#/me/${section}` : '#/me'),
  guides: (game: Game = 'kout', view: 'score' | 'rules' = 'score') => `#/guides?game=${game}&view=${view}`,
  welcome: (from?: string) => (from ? `#/welcome?from=${encodeURIComponent(from)}` : '#/welcome'),
  score: (id: string, table?: string) => (table ? `#/score/${id}?table=${table}` : `#/score/${id}`),
  player: (id: string) => `#/player/${id}`,
  /** S2; `from` is the route to come back to after Google, e.g. "league" or "d/<uuid>". */
  signin: (mode: 'signin' | 'register' = 'signin', from?: string) =>
    `#/signin?mode=${mode}${from ? `&from=${encodeURIComponent(from)}` : ''}`,
};

/** Set once the Welcome panels were seen after sign-in, so they show once per device. */
export const WELCOMED = 'dt.welcomed.v1';

/** The current route as a `from` value for href.signin, so sign-in comes back to it. */
export function currentFrom(hash: string = window.location.hash): string | undefined {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  return FROM.test(path) && !path.startsWith('signin') && !path.startsWith('welcome') ? path : undefined;
}

/** Which tab a pushed screen belongs to, so the bar keeps its pill on the tab the user came from. */
export function tabOf(r: Route, from: Tab = 'tonight'): Tab {
  switch (r.name) {
    case 'welcome':
      return 'tonight';
    case 'signin':
    case 'terms':
      return from; // pushed over the tab that asked for an account
    case 'place':
      return from === 'diwaniya' || from === 'inbox' ? from : 'tonight';
    case 'settings':
      return 'diwaniya';
    case 'score':
      // Hosts score from the Diwaniya tab, guests from Tonight or League (ADC-LOG-754 item 4).
      return from === 'tonight' || from === 'league' ? from : 'diwaniya';
    case 'pings':
    case 'admin':
      return 'me';
    case 'guides':
      return from === 'diwaniya' || from === 'tonight' ? from : 'league';
    case 'player':
      return from === 'league' || from === 'diwaniya' || from === 'tonight' ? from : 'league';
    default:
      return r.name;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(to: string) {
  window.location.hash = to;
}

/** Back within the app when there is history, else to the screen's parent. */
export function back(fallback: string) {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
}
