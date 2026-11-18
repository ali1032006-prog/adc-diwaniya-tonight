import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavBar } from './components/NavBar';
import { Tonight } from './screens/Tonight';
import { Board } from './screens/Board';
import { League } from './screens/League';
import { Inbox } from './screens/Inbox';
import { Me } from './screens/Me';
import { Place } from './screens/Place';
import { Welcome } from './screens/Welcome';
import { SignIn } from './screens/SignIn';
import { Skeleton } from './components/ui';
import { Splash, SPLASHED } from './components/Logo';
import { PrefsContext, loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { SessionProvider, useSession } from './lib/session';
import { useAsync } from './lib/useAsync';
import { unreadCount } from './lib/api';
import { dirFor, STRINGS } from './lib/i18n';
import { TABS, WELCOMED, currentFrom, go, href, tabOf, useRoute, type Route, type Tab } from './lib/router';

// Screens most visits never open load on demand, so the first paint carries less script
// (impeccable audit r1/r2 P2: one 740 kB chunk).
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const Score = lazy(() => import('./screens/Score').then((m) => ({ default: m.Score })));
const Player = lazy(() => import('./screens/Player').then((m) => ({ default: m.Player })));
const Terms = lazy(() => import('./screens/Terms').then((m) => ({ default: m.Terms })));
const Pings = lazy(() => import('./screens/Pings').then((m) => ({ default: m.Pings })));
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
const Guides = lazy(() => import('./screens/Guides').then((m) => ({ default: m.Guides })));

function screenFor(route: Route): React.JSX.Element {
  switch (route.name) {
    case 'place':
      return <Place id={route.id} />;
    case 'settings':
      return <Settings id={route.id} section={route.section} />;
    case 'score':
      return <Score id={route.id} table={route.table} />;
    case 'signin':
      return <SignIn mode={route.mode} from={route.from} />;
    case 'terms':
      return <Terms />;
    case 'pings':
      return <Pings />;
    case 'admin':
      return <Admin />;
    case 'guides':
      return <Guides game={route.game} view={route.view} />;
    case 'player':
      return <Player id={route.id} />;
    case 'diwaniya':
      return <Board />;
    case 'league':
      return <League />;
    case 'inbox':
      return <Inbox />;
    case 'me':
      return <Me section={route.section} />;
    default:
      return <Tonight />;
  }
}

export function App() {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((old) => {
      const next = { ...old, ...p };
      savePrefs(next);
      return next;
    });
  }, []);
  const ctx = useMemo(() => ({ prefs, setPrefs }), [prefs, setPrefs]);

  // Language drives dir; theme drives the palette (auto follows prefers-color-scheme in CSS).
  useEffect(() => {
    const root = document.documentElement;
    root.lang = prefs.lang;
    root.dir = dirFor(prefs.lang);
    root.dataset.theme = prefs.theme;
    document.title = STRINGS[prefs.lang].appName;
  }, [prefs]);

  return (
    <PrefsContext.Provider value={ctx}>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </PrefsContext.Provider>
  );
}

function Shell() {
  const route = useRoute();
  const { status } = useSession();
  const lastTab = useRef<Tab>('tonight');
  const active = tabOf(route, lastTab.current);
  // Launch (ADC-LOG-764 item 5): the logo plays once per visit before anything else shows.
  const [splash, setSplash] = useState(() => !sessionStorage.getItem(SPLASHED));
  const endSplash = useCallback(() => {
    sessionStorage.setItem(SPLASHED, '1');
    setSplash(false);
  }, []);
  // Saffron unread count on the Inbox tab, kept live.
  const unread = useAsync(() => (status === 'ready' ? unreadCount() : Promise.resolve(0)), [status], status === 'ready' ? ['inbox'] : []);
  useEffect(() => {
    if ((TABS as readonly string[]).includes(route.name)) lastTab.current = route.name as Tab;
  }, [route.name]);

  // Then straight to sign-in when signed out (the Terms stay readable); after the first sign-in the
  // Welcome steps play once, then the screen the person was heading for.
  useEffect(() => {
    if ((status === 'signedOut' || status === 'offline') && !['signin', 'terms'].includes(route.name)) {
      go(href.signin('signin', currentFrom()));
    } else if ((status === 'ready' || status === 'needsProfile') && !localStorage.getItem(WELCOMED) && !['welcome', 'terms', 'pings'].includes(route.name)) {
      go(href.welcome(route.name === 'signin' ? route.from : currentFrom()));
    }
  }, [status, route]);

  // Tapping the active tab returns to the top of its root (instant under reduced motion).
  const reselect = useCallback(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  if (splash) return <Splash onDone={endSplash} />;
  if (route.name === 'welcome') {
    const to = route.from;
    return (
      <Welcome
        onDone={() => {
          localStorage.setItem(WELCOMED, '1');
          go(to ? `#/${to}` : '#/tonight');
        }}
      />
    );
  }
  // Signed out there is no app behind sign-in yet: no tab bar, sign-in is the first screen.
  if ((status === 'signedOut' || status === 'offline') && (route.name === 'signin' || route.name === 'terms')) {
    return (
      <main className="screen screen--solo" key={route.name}>
        <Suspense fallback={<Skeleton rows={4} />}>{screenFor(route)}</Suspense>
      </main>
    );
  }
  const key = route.name + ('id' in route ? route.id : '') + ('section' in route ? route.section ?? '' : '');
  const pushed = 'id' in route || ('section' in route && !!route.section) || ['signin', 'terms', 'pings', 'admin', 'guides'].includes(route.name);
  // Score a game is full screen: the bar steps aside for the room.
  if (route.name === 'score') {
    return (
      <main className="screen screen--full" key={key}>
        <Suspense fallback={<Skeleton rows={4} />}>{screenFor(route)}</Suspense>
      </main>
    );
  }
  return (
    <div className="shell">
      <NavBar active={active} onReselect={reselect} inboxCount={unread.data ?? 0} />
      <main className={pushed ? 'screen screen--push' : 'screen'} key={key}>
        <Suspense fallback={<Skeleton rows={4} />}>{screenFor(route)}</Suspense>
      </main>
    </div>
  );
}
