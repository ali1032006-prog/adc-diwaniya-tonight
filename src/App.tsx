import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavBar } from './components/NavBar';
import { Tonight, Diwaniya, League, Inbox } from './screens/Tabs';
import { Me } from './screens/Me';
import { Welcome } from './screens/Welcome';
import { PrefsContext, loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { dirFor, STRINGS } from './lib/i18n';
import { useRoute, type Tab } from './lib/router';

const WELCOMED = 'dt.welcomed.v1';

const SCREENS: Record<Tab, () => React.JSX.Element> = {
  tonight: Tonight,
  diwaniya: Diwaniya,
  league: League,
  inbox: Inbox,
  me: Me,
};

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
  const route = useRoute();

  // Language drives dir; theme drives the palette (auto follows prefers-color-scheme in CSS).
  useEffect(() => {
    const root = document.documentElement;
    root.lang = prefs.lang;
    root.dir = dirFor(prefs.lang);
    root.dataset.theme = prefs.theme;
    document.title = STRINGS[prefs.lang].appName;
  }, [prefs]);

  // First open goes to Welcome once; after that the app opens on Tonight.
  useEffect(() => {
    if (!localStorage.getItem(WELCOMED) && route.name !== 'welcome') window.location.hash = '#/welcome';
  }, [route.name]);

  // Tapping the active tab returns to the top of its root (instant under reduced motion).
  const reselect = useCallback(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  if (route.name === 'welcome') {
    return (
      <PrefsContext.Provider value={ctx}>
        <Welcome onDone={() => localStorage.setItem(WELCOMED, '1')} />
      </PrefsContext.Provider>
    );
  }

  const Current = SCREENS[route.name];
  return (
    <PrefsContext.Provider value={ctx}>
      <div className="shell">
        <NavBar active={route.name} onReselect={reselect} />
        <main className="screen" key={route.name}>
          <Current />
        </main>
      </div>
    </PrefsContext.Provider>
  );
}
