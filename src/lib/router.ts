import { useEffect, useState } from 'react';

export const TABS = ['tonight', 'diwaniya', 'league', 'inbox', 'me'] as const;
export type Tab = (typeof TABS)[number];
export type Route = { name: Tab } | { name: 'welcome' };

/** Parse a hash like "#/league" into a route; unknown paths go to Tonight. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  if (path === 'welcome') return { name: 'welcome' };
  return { name: (TABS as readonly string[]).includes(path) ? (path as Tab) : 'tonight' };
}

export function hrefFor(name: Route['name']): string {
  return `#/${name}`;
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
