import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavBar } from './components/NavBar';
import { Tonight } from './screens/Tonight';
import { Board } from './screens/Board';
import { League } from './screens/League';
import { Inbox } from './screens/Inbox';
import { Me } from './screens/Me';
import { Place } from './screens/Place';
import { Settings } from './screens/Settings';
import { Score } from './screens/Score';
import { Player } from './screens/Player';
import { Welcome } from './screens/Welcome';
import { SignIn } from './screens/SignIn';
import { Terms } from './screens/Terms';
import { PrefsContext, loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { SessionProvider, useSession } from './lib/session';
import { useAsync } from './lib/useAsync';
import { unreadCount } from './lib/api';
import { dirFor, STRINGS } from './lib/i18n';
import { TABS, WELCOMED, tabOf, useRoute, type Route, type Tab } from './lib/router';


function screenFor(route: Route): React.JSX.Element {
  switch (route.name) {
    case 'place':
      return <Place id={route.id} />;
    case 'settings':
      return <Settings id={route.id} />;
    case 'score':
      return <Score id={route.id} table={route.table} />;
    case 'signin':
      return <SignIn mode={route.mode} from={route.from} />;
    case 'terms':
      return <Terms />;
    case 'player':
      return <Player id={route.id} />;
    case 'diwaniya':
      return <Board />;
    case 'league':
      return <League />;
    case 'inbox':
      return <Inbox />;
    case 'me':
      return <Me />;
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
  // Saffron unread count on the Inbox tab, kept live.
  const unread = useAsync(() => (status === 'ready' ? unreadCount() : Promise.resolve(0)), [status], status === 'ready' ? ['inbox'] : []);
  useEffect(() => {
    if ((TABS as readonly string[]).includes(route.name)) lastTab.current = route.name as Tab;
  }, [route.name]);

  // First open goes to Welcome once; after that the app opens on Tonight.
  useEffect(() => {
    if (!localStorage.getItem(WELCOMED) && !['welcome', 'signin', 'terms'].includes(route.name)) window.location.hash = '#/welcome';
  }, [route.name]);

  // Tapping the active tab returns to the top of its root (instant under reduced motion).
  const reselect = useCallback(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  if (route.name === 'welcome') return <Welcome onDone={() => localStorage.setItem(WELCOMED, '1')} />;
  const key = route.name + ('id' in route ? route.id : '');
  const pushed = 'id' in route || route.name === 'signin' || route.name === 'terms';
  // Score a game is full screen: the bar steps aside for the room.
  if (route.name === 'score') {
    return (
      <main className="screen screen--full" key={key}>
        {screenFor(route)}
      </main>
    );
  }
  return (
    <div className="shell">
      <NavBar active={active} onReselect={reselect} inboxCount={unread.data ?? 0} />
      <main className={pushed ? 'screen screen--push' : 'screen'} key={key}>
        {screenFor(route)}
      </main>
    </div>
  );
}
