import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { useCallback, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { UnreadContext } from './lib/unread';
import { COPY } from './lib/copy';
import signInSrc from './screens/SignIn.tsx?raw';
import viteConfigSrc from '../vite.config.ts?raw';
import pkgSrc from '../package.json?raw';

// Ali's change list 5 (ADC-LOG-806): (1) Tonight: ONE Filter button opening a sheet with Location
// (All of Kuwait / Governorate / Area, then which one) and Game (every game); (2) the preview-only
// test sign-in section is gone, test accounts use the normal form; (3) language switch before sign-in.
const api = vi.hoisted(() => ({
  listTonight: vi.fn(),
  myDiwaniyaList: vi.fn(),
  updatePrivate: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});
vi.mock('./lib/supabase', () => ({
  supabase: () => ({ auth: { signInWithOAuth: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn() } }),
  setSupabaseForTests: () => {},
}));

const { Tonight, filterCount, nightCounts } = await import('./screens/Tonight');
const { SignIn } = await import('./screens/SignIn');
const { Welcome } = await import('./screens/Welcome');
const { PrefsSync } = await import('./App');

const ME = '11111111-1111-4111-8111-111111111111';
const HOST = '33333333-3333-4333-8333-333333333333';
const en = COPY.en;
const ar = COPY.ar;

const ready = (lang: 'ar' | 'en' = 'en'): SessionCtx => ({
  status: 'ready',
  userId: ME,
  email: 'me@example.invalid',
  provider: 'email',
  profile: { id: ME, display_name: 'Ali', area: 'السالمية', games: ['kout'], created_at: '2026-11-01T10:00:00Z' },
  priv: {
    birth_date: '1990-01-01',
    terms_accepted_at: '2026-11-01T10:00:00Z',
    male_confirmed_at: null,
    lang,
    numerals: 'auto',
    theme: 'auto',
    ping_games: [],
    ping_areas: [],
    quiet_start: null,
    quiet_end: null,
    ping_daily_cap: 3,
  },
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
});
const signedOut: SessionCtx = { status: 'signedOut', userId: null, email: null, provider: null, profile: null, priv: null, refresh: async () => {}, signOut: async () => {} };

function withAll(ui: React.ReactNode, session: SessionCtx = ready()) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, lang: 'en' }, setPrefs: () => {} }}>
      <SessionContext.Provider value={session}>
        <UnreadContext.Provider value={{ inbox: 0, messages: 0 }}>{ui}</UnreadContext.Provider>
      </SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

/** The app's real prefs behaviour: state + localStorage, as App holds it. */
function LivePrefs({ children, seen }: { children: React.ReactNode; seen?: (p: Prefs) => void }) {
  const [prefs, set] = useState<Prefs>(() => loadPrefs());
  const setPrefs = useCallback((p: Partial<Prefs>) => {
    set((old) => {
      const next = { ...old, ...p };
      savePrefs(next);
      return next;
    });
  }, []);
  seen?.(prefs);
  return <PrefsContext.Provider value={{ prefs, setPrefs }}>{children}</PrefsContext.Provider>;
}

// jsdom has no showModal: open the dialog the simple way so its content is in the a11y tree.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const night = (id: string, area: string, game: 'kout' | 'baloot' = 'kout') => ({
  id,
  starts_at: '2026-11-18T18:00:00Z',
  status: 'open' as const,
  diwaniya: { id: `d-${id}`, name: `Diwaniya ${id}`, area, usual_slot: '', host_id: HOST, visibility: 'public' as const },
  tables: [{ id: `t-${id}`, game, seat_count: 4, label: 'A', queue_mode: 'rotation' as const, need_one: false, seats: [], queue: [] }],
});
const list = [night('a', 'السالمية'), night('b', 'الجابرية', 'baloot'), night('c', 'الجهراء')];

async function openTonight() {
  api.listTonight.mockResolvedValue(list);
  api.myDiwaniyaList.mockResolvedValue([]);
  withAll(<Tonight />);
  return waitFor(() => {
    const b = document.querySelector<HTMLButtonElement>('.filter-btn');
    if (!b) throw new Error('no Filter button yet');
    return b;
  });
}
// jsdom has no showModal, so the dialog is never 'open' for role queries: take the element itself.
const sheet = () => document.querySelector('dialog.sheet') as HTMLElement;

describe('(1) Tonight: one Filter button and its sheet', () => {
  it('counts the filters that are on: the place once, each game once', () => {
    expect(filterCount('all', [])).toBe(0);
    expect(filterCount('gov:hawalli', [])).toBe(1);
    expect(filterCount('area:السالمية', ['kout', 'baloot'])).toBe(3);
    const n = nightCounts(list);
    expect(n.gov.get('hawalli')).toBe(2);
    expect(n.area.get('الجهراء')).toBe(1);
  });

  it('the page shows only the Filter button: no location dropdown, no game chips', async () => {
    const btn = await openTonight();
    expect(btn.textContent).toContain('Filter');
    expect(document.querySelector('select')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByLabelText(en.tonight.where)).toBeNull();
  });

  it('the sheet has the Location and Game headers; Location offers All of Kuwait, Governorate and Area', async () => {
    fireEvent.click(await openTonight());
    const d = sheet();
    expect(within(d).getByText(en.tonight.where).tagName).toBe('LEGEND');
    expect(within(d).getByText(en.tonight.game).tagName).toBe('LEGEND');
    const radios = within(d).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.closest('label')!.textContent)).toEqual(['All of Kuwait', 'Governorate', 'Area']);
    expect(radios[0].checked).toBe(true);
    expect(d.querySelector('select')).toBeNull();
  });

  it('Game lists every game, even ones with no night tonight', async () => {
    fireEvent.click(await openTonight());
    const names = (within(sheet()).getAllByRole('checkbox') as HTMLInputElement[]).map((c) => c.closest('label')!.textContent);
    expect(names).toEqual(['All games', 'Kout', 'Baloot', 'Tarneeb', 'Trix']);
  });

  it('Governorate then a specific governorate, Apply: the list, the badge and the saved choice follow', async () => {
    fireEvent.click(await openTonight());
    const d = sheet();
    fireEvent.click(within(d).getByRole('radio', { name: 'Governorate' }));
    const apply = within(d).getByRole('button', { name: en.tonight.apply }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true); // a kind with no specific one picked yet
    expect(within(d).getByText(en.tonight.needGov)).toBeTruthy();
    const gov = within(d).getByRole('combobox', { name: 'Governorate' }) as HTMLSelectElement;
    expect([...gov.options].filter((o) => !o.disabled).map((o) => o.textContent)).toEqual([
      'Capital',
      'Hawalli (2)',
      'Farwaniya',
      'Mubarak Al-Kabeer',
      'Ahmadi',
      'Jahra (1)',
    ]);
    fireEvent.change(gov, { target: { value: 'jahra' } });
    expect(within(d).getByText('1 diwaniya open tonight')).toBeTruthy(); // live preview before Apply
    expect(screen.getByText('Diwaniya a')).toBeTruthy(); // nothing changes until Apply
    fireEvent.click(apply);
    await waitFor(() => expect(document.querySelector('dialog.sheet')).toBeNull());
    expect(screen.getByText('Diwaniya c')).toBeTruthy();
    expect(screen.queryByText('Diwaniya a')).toBeNull();
    expect(screen.getByRole('button', { name: en.tonight.filterOn('1') }).textContent).toContain('1');
    expect(screen.getByText('All of Jahra')).toBeTruthy(); // the governorate, not the area of the same name
    expect(localStorage.getItem('dt.tonight.where.v1')).toBe('gov:jahra');
  });

  it('Area then a specific area, plus a game: both apply, the badge says 2', async () => {
    fireEvent.click(await openTonight());
    const d = sheet();
    fireEvent.click(within(d).getByRole('radio', { name: 'Area' }));
    const area = within(d).getByRole('combobox', { name: 'Area' }) as HTMLSelectElement;
    expect(area.querySelectorAll('optgroup').length).toBe(6);
    fireEvent.change(area, { target: { value: 'الجابرية' } });
    fireEvent.click(within(d).getByRole('checkbox', { name: 'Baloot' }));
    expect((within(d).getByRole('checkbox', { name: 'All games' }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(d).getByRole('button', { name: en.tonight.apply }));
    await waitFor(() => expect(document.querySelector('dialog.sheet')).toBeNull());
    expect(screen.getByText('Diwaniya b')).toBeTruthy();
    expect(screen.queryByText('Diwaniya a')).toBeNull();
    expect(screen.getByRole('button', { name: en.tonight.filterOn('2') })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('dt.tonight.games.v1')!)).toEqual(['baloot']);
  });

  it('the red Clear empties Location and Game and applies at once', async () => {
    localStorage.setItem('dt.tonight.where.v1', 'gov:jahra');
    localStorage.setItem('dt.tonight.games.v1', '["kout"]');
    fireEvent.click(await openTonight());
    const d = sheet();
    expect((within(d).getByRole('combobox', { name: 'Governorate' }) as HTMLSelectElement).value).toBe('jahra');
    const clear = within(d).getByRole('button', { name: en.tonight.clearShort });
    expect(clear.className).toContain('btn--danger');
    fireEvent.click(clear);
    await waitFor(() => expect(document.querySelector('dialog.sheet')).toBeNull());
    expect(screen.getByText('Diwaniya a')).toBeTruthy();
    expect(screen.getByText('Diwaniya b')).toBeTruthy();
    expect(screen.getByRole('button', { name: en.tonight.filter }).querySelector('.filter-btn__badge')).toBeNull();
    expect(localStorage.getItem('dt.tonight.where.v1')).toBe('all');
  });
});

describe('(2) the test sign-in section is gone', () => {
  it('no preview-only form, flag or build script is left', () => {
    expect(Object.keys(import.meta.glob('./preview/**'))).toEqual([]);
    expect(signInSrc).not.toMatch(/TestSignIn|__PREVIEW_SIGNIN__/);
    expect(viteConfigSrc).not.toMatch(/PREVIEW_SIGNIN/);
    expect(pkgSrc).not.toMatch(/build:preview|PREVIEW_SIGNIN/);
  });
  it('signed out, Sign in shows Google and the normal email + password form only', () => {
    withAll(<SignIn mode="signin" />, signedOut);
    expect(screen.queryByText(/test account/i)).toBeNull();
    expect(document.querySelectorAll('input[type="password"]').length).toBe(1);
    expect(document.querySelectorAll('input[type="email"]').length).toBe(1);
  });
});

describe('(3) language switch before signing in, remembered, kept after sign-in', () => {
  it('the signed-out sign-in screen has the switch; it flips the screen and is saved on the device', async () => {
    let now: Prefs = DEFAULT_PREFS;
    render(
      <LivePrefs seen={(p) => (now = p)}>
        <SessionContext.Provider value={signedOut}>
          <SignIn mode="signin" />
        </SessionContext.Provider>
      </LivePrefs>,
    );
    expect(now.lang).toBe('ar');
    const sw = screen.getByRole('button', { name: 'English' });
    expect(sw.querySelector('[lang="en"]')).toBeTruthy();
    fireEvent.click(sw);
    expect(now.lang).toBe('en');
    expect(loadPrefs().lang).toBe('en');
    expect(await screen.findByRole('heading', { name: en.signin.signInLead })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(loadPrefs().lang).toBe('ar');
    expect(await screen.findByRole('heading', { name: ar.signin.signInLead })).toBeTruthy();
  });

  it('the Welcome steps have the same switch', () => {
    render(
      <LivePrefs>
        <Welcome onDone={() => {}} />
      </LivePrefs>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(loadPrefs().lang).toBe('en');
    expect(screen.getByRole('button', { name: 'العربية' })).toBeTruthy();
  });

  it('English picked before sign-in stays English once an account that saved Arabic signs in, and the account follows', async () => {
    api.updatePrivate.mockResolvedValue(undefined);
    savePrefs({ ...DEFAULT_PREFS, lang: 'en' }); // chosen on the sign-in screen
    let now: Prefs = DEFAULT_PREFS;
    function Flow({ session }: { session: SessionCtx }) {
      return (
        <SessionContext.Provider value={session}>
          <PrefsSync />
        </SessionContext.Provider>
      );
    }
    const { rerender } = render(
      <LivePrefs seen={(p) => (now = p)}>
        <Flow session={signedOut} />
      </LivePrefs>,
    );
    rerender(
      <LivePrefs seen={(p) => (now = p)}>
        <Flow session={ready('ar')} />
      </LivePrefs>,
    );
    await waitFor(() => expect(api.updatePrivate).toHaveBeenCalledWith({ lang: 'en' }));
    expect(now.lang).toBe('en');
    expect(loadPrefs().lang).toBe('en');
  });
});
