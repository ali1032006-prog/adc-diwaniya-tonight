import { useEffect, useState } from 'react';
import type { Game } from './api';

// Ali's change list 3 (ADC-LOG-781): Score is the middle tab; Inbox moved to the top menu.
export const TABS = ['tonight', 'diwaniya', 'score', 'league', 'me'] as const;
export type Tab = (typeof TABS)[number];

export type Route =
  | { name: 'tonight' }
  | { name: 'league' }
  | { name: 'score'; id?: string; table?: string } // the Score tab; with an id, that diwaniya's sheet
  | { name: 'diwaniya'; id?: string } // S8 one page for everything about the diwaniya (item 4)
  | { name: 'me'; section?: MeSection } // S14 Me: a menu; each button opens its section (ADC-LOG-764 item 7)
  | { name: 'inbox' } // S13, opened from the top menu (item 1)
  | { name: 'messages' } // conversations with hosts (item 2)
  | { name: 'thread'; id: string } // one conversation
  | { name: 'dm'; id: string } // write to this diwaniya's host (opens the existing thread if there is one)
  | { name: 'welcome'; from?: string } // S1, shown once right after the first sign-in (ADC-LOG-764 item 5)
  | { name: 'guides'; game: Game; view: 'score' | 'rules' } // game guides (ADC-LOG-764 item 4)
  | { name: 'signin'; mode: 'signin' | 'register'; from?: string } // S2 Sign in and Register (Google only)
  | { name: 'terms' } // Terms and Privacy (ruling C: men only, ruling B: 18+)
  | { name: 'pings' } // S4 Install and pings guide
  | { name: 'admin' } // moderation queue, Ali's admin role (ruling D)
  | { name: 'place'; id: string } // S6 Diwaniya page (pushed from Tonight, Diwaniya or Inbox)
  | { name: 'player'; id: string }; // S12 Player profile

export const ME_SECTIONS = ['prefs', 'account', 'pings', 'privacy', 'data', 'delete'] as const;
export type MeSection = (typeof ME_SECTIONS)[number];
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
  if (head === 'inbox') return { name: 'inbox' };
  if (head === 'signin') {
    const q = new URLSearchParams(query);
    const from = q.get('from') ?? undefined;
    return { name: 'signin', mode: q.get('mode') === 'register' ? 'register' : 'signin', ...(from && /^[a-z]+(\/[0-9a-f-]{36})?$/i.test(from) ? { from } : {}) };
  }
  if (head === 'messages') {
    if (parts[1] === 'd' && UUID.test(parts[2] ?? '')) return { name: 'dm', id: parts[2] };
    return UUID.test(id) ? { name: 'thread', id } : { name: 'messages' };
  }
  if (head === 'score') {
    if (!UUID.test(id)) return { name: 'score' };
    const table = new URLSearchParams(query).get('table');
    return table && UUID.test(table) ? { name: 'score', id, table } : { name: 'score', id };
  }
  if (head === 'diwaniya' || head === 'settings') {
    // The old settings pages (#/settings/<id>[/section]) now live on the one Diwaniya page.
    return UUID.test(id) ? { name: 'diwaniya', id } : { name: 'diwaniya' };
  }
  if (UUID.test(id)) {
    if (head === 'd') return { name: 'place', id };
    if (head === 'player') return { name: 'player', id };
  }
  if (head === 'league') return { name: 'league' };
  return { name: 'tonight' };
}

export function hrefFor(name: Tab | 'welcome' | 'terms' | 'pings' | 'admin' | 'inbox' | 'messages'): string {
  return `#/${name}`;
}

export const href = {
  place: (id: string) => `#/d/${id}`,
  diwaniya: (id?: string) => (id ? `#/diwaniya/${id}` : '#/diwaniya'),
  me: (section?: MeSection) => (section ? `#/me/${section}` : '#/me'),
  guides: (game: Game = 'kout', view: 'score' | 'rules' = 'score') => `#/guides?game=${game}&view=${view}`,
  welcome: (from?: string) => (from ? `#/welcome?from=${encodeURIComponent(from)}` : '#/welcome'),
  score: (id?: string, table?: string) => (!id ? '#/score' : table ? `#/score/${id}?table=${table}` : `#/score/${id}`),
  player: (id: string) => `#/player/${id}`,
  thread: (id: string) => `#/messages/${id}`,
  dm: (diwaniyaId: string) => `#/messages/d/${diwaniyaId}`,
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
    case 'inbox':
    case 'messages':
    case 'thread':
    case 'dm':
      return from; // opened from the top menu (or pushed over the tab that asked for an account)
    case 'place':
      return from === 'diwaniya' ? from : 'tonight';
    case 'pings':
    case 'admin':
      return 'me';
    case 'guides':
      return from === 'diwaniya' || from === 'tonight' || from === 'score' ? from : 'league';
    case 'player':
      return from === 'league' || from === 'diwaniya' || from === 'tonight' || from === 'score' ? from : 'league';
    default:
      return r.name;
  }
}

/** Pushed screens show a back arrow instead of a tab title. */
export function isPushed(r: Route): boolean {
  if (r.name === 'me') return !!r.section;
  if (r.name === 'score' || r.name === 'diwaniya') return false;
  return !(TABS as readonly string[]).includes(r.name);
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
