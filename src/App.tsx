import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { NewPassword } from './components/EmailAuth';
import { Splash, SPLASHED } from './components/Logo';
import { PrefsContext, loadPrefs, prefsDiff, savePrefs, type Prefs } from './lib/prefs';
import { SessionProvider, useSession } from './lib/session';
import { useAsync } from './lib/useAsync';
import { unreadCount, unreadMessages, updatePrivate } from './lib/api';
import { UnreadContext } from './lib/unread';
import { dirFor, STRINGS } from './lib/i18n';
import { TABS, WELCOMED, currentFrom, go, href, isPushed, tabOf, useRoute, type Route, type Tab } from './lib/router';

// Screens most visits never open load on demand, so the first paint carries less script
// (impeccable audit r1/r2 P2: one 740 kB chunk).
const Score = lazy(() => import('./screens/Score').then((m) => ({ default: m.Score })));
const Player = lazy(() => import('./screens/Player').then((m) => ({ default: m.Player })));
const Terms = lazy(() => import('./screens/Terms').then((m) => ({ default: m.Terms })));
const Pings = lazy(() => import('./screens/Pings').then((m) => ({ default: m.Pings })));
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
const Guides = lazy(() => import('./screens/Guides').then((m) => ({ default: m.Guides })));
const Messages = lazy(() => import('./screens/Messages').then((m) => ({ default: m.Messages })));
const Thread = lazy(() => import('./screens/Messages').then((m) => ({ default: m.Thread })));
const Dm = lazy(() => import('./screens/Messages').then((m) => ({ default: m.Dm })));

function screenFor(route: Route): React.JSX.Element {
  switch (route.name) {
    case 'place':
      return <Place id={route.id} />;
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
      return <Board id={route.id} />;
    case 'league':
      return <League />;
    case 'inbox':
      return <Inbox />;
    case 'messages':
      return <Messages />;
    case 'thread':
      return <Thread id={route.id} />;
    case 'dm':
      return <Dm id={route.id} />;
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
        <PrefsSync />
        <Shell />
      </SessionProvider>
    </PrefsContext.Provider>
  );
}

/**
 * Keeps the account's saved language, numerals and theme in step with this device (ADC-LOG-794
 * item 2). Before, the Me page wrote the account's old value over the device's choice the first
 * time it opened, so Arabic flipped to English. Now the device wins and the account follows, once
 * per change, wherever it was made (Welcome, Me, sign-in).
 */
export function PrefsSync() {
  const { prefs } = useContext(PrefsContext);
  const { status, userId, priv } = useSession();
  // What the account holds as far as this tab knows, per person (the session's copy goes stale).
  const known = useRef<{ user: string; p: Pick<Prefs, 'lang' | 'numerals' | 'theme'> } | null>(null);
  useEffect(() => {
    if (status !== 'ready' || !userId || !priv) return;
    if (known.current?.user !== userId) known.current = { user: userId, p: { lang: priv.lang, numerals: priv.numerals, theme: priv.theme } };
    const diff = prefsDiff(prefs, known.current.p);
    if (Object.keys(diff).length === 0) return;
    const before = known.current.p;
    known.current = { user: userId, p: { lang: prefs.lang, numerals: prefs.numerals, theme: prefs.theme } };
    void updatePrivate(diff).catch(() => {
      if (known.current?.user === userId) known.current = { user: userId, p: before };
    });
  }, [status, userId, priv, prefs]);
  return null;
}

function Shell() {
  const route = useRoute();
  const { status, recovery } = useSession();
  const lastTab = useRef<Tab>('tonight');
  const active = tabOf(route, lastTab.current);
  // Launch (ADC-LOG-764 item 5): the logo plays once per visit before anything else shows.
  const [splash, setSplash] = useState(() => !sessionStorage.getItem(SPLASHED));
  const endSplash = useCallback(() => {
    sessionStorage.setItem(SPLASHED, '1');
    setSplash(false);
  }, []);
  // Unread Inbox pings and new messages for the top menu's badge (item 1), kept live.
  const ready = status === 'ready';
  const inbox = useAsync(() => (ready ? unreadCount() : Promise.resolve(0)), [ready], ready ? ['inbox'] : []);
  const msgs = useAsync(() => (ready ? unreadMessages() : Promise.resolve(0)), [ready], ready ? ['messages'] : []);
  const unread = useMemo(() => ({ inbox: inbox.data ?? 0, messages: msgs.data ?? 0 }), [inbox.data, msgs.data]);
  // Reading a thread or the inbox changes the counts; refresh them on every move.
  const reloadInbox = inbox.reload;
  const reloadMsgs = msgs.reload;
  useEffect(() => {
    if (!ready) return;
    reloadInbox();
    reloadMsgs();
  }, [route, ready, reloadInbox, reloadMsgs]);
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
  // A password-reset link signed this browser in: choose the new password before anything else.
  if (recovery && (status === 'ready' || status === 'needsProfile')) {
    return (
      <main className="screen screen--solo" key="new-password">
        <div className="screen__body signin">
          <NewPassword />
        </div>
      </main>
    );
  }
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
  const key = route.name + ('id' in route ? route.id ?? '' : '') + ('section' in route ? route.section ?? '' : '');
  return (
    <UnreadContext.Provider value={unread}>
      <div className="shell">
        <NavBar active={active} onReselect={reselect} />
        <main className={isPushed(route) ? 'screen screen--push' : 'screen'} key={key}>
          <Suspense fallback={<Skeleton rows={4} />}>{screenFor(route)}</Suspense>
        </main>
      </div>
    </UnreadContext.Provider>
  );
}
