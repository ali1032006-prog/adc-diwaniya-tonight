import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { useCallback, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { UnreadContext } from './lib/unread';
import { COPY } from './lib/copy';

// Ali's change list 4 (ADC-LOG-794): (1) Score: no 'someone else' text and no dropdowns when adding
// people; (2) first visit to Me flipped the language to English; (3) Diwaniya page: Settings inside
// Tonight at the top, list fields shown as dropdowns, Location last, one Save at the bottom;
// (4) Tonight filters by location and by game.
const api = vi.hoisted(() => ({
  scoreTargets: vi.fn(),
  openSheet: vi.fn(),
  getOpenNight: vi.fn(),
  scoreRoster: vi.fn(),
  startScore: vi.fn(),
  getSheet: vi.fn(),
  myDiwaniyas: vi.fn(),
  getPin: vi.fn(),
  setPin: vi.fn(),
  listRegulars: vi.fn(),
  listCohosts: vi.fn(),
  listRequests: vi.fn(),
  listAnnouncements: vi.fn(),
  lastNightAt: vi.fn(),
  followerCount: vi.fn(),
  updateDiwaniya: vi.fn(),
  updatePrivate: vi.fn(),
  amIAdmin: vi.fn(),
  myCohostInvites: vi.fn(),
  listTonight: vi.fn(),
  myDiwaniyaList: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { Score } = await import('./screens/Score');
const { Board } = await import('./screens/Board');
const { Me } = await import('./screens/Me');
const { Tonight, filterNights, locationOptions } = await import('./screens/Tonight');
const { PrefsSync } = await import('./App');

const ME = '11111111-1111-4111-8111-111111111111';
const HOST = '33333333-3333-4333-8333-333333333333';
const OMAR = '66666666-6666-4666-8666-666666666666';
const DW = '22222222-2222-4222-8222-222222222222';
const NIGHT = '44444444-4444-4444-8444-444444444444';
const TB = '55555555-5555-4555-8555-555555555555';
const en = COPY.en;

const ready = (lang: 'ar' | 'en' = 'en'): SessionCtx => ({
  status: 'ready',
  userId: ME,
  email: 'me@example.invalid',
  provider: 'google',
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

function withAll(ui: React.ReactNode, session: SessionCtx = ready(), prefs: Partial<Prefs> = { lang: 'en' }) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={session}>
        <UnreadContext.Provider value={{ inbox: 0, messages: 0 }}>{ui}</UnreadContext.Provider>
      </SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

/** The app's real prefs behaviour: state + localStorage, as App holds it. */
function LivePrefs({ children, seen }: { children: React.ReactNode; seen: (p: Prefs) => void }) {
  const [prefs, set] = useState<Prefs>(() => loadPrefs());
  const setPrefs = useCallback((p: Partial<Prefs>) => {
    set((old) => {
      const next = { ...old, ...p };
      savePrefs(next);
      return next;
    });
  }, []);
  seen(prefs);
  return <PrefsContext.Provider value={{ prefs, setPrefs }}>{children}</PrefsContext.Provider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

// ------------------------------------------------------------------ (1) Score: adding people
const seatsAt = (s: { seat_no: number; user_id: string | null; walk_in_name: string | null; profile?: { display_name: string } }[]) => ({
  id: NIGHT,
  starts_at: '2026-11-18T18:00:00Z',
  status: 'open' as const,
  diwaniya_id: DW,
  tables: [{ id: TB, game: 'kout' as const, seat_count: 4, label: 'A', queue_mode: 'rotation' as const, need_one: false, seats: s, queue: [] }],
});
const roster = [
  { id: ME, name: 'Ali', seat: 1 },
  { id: HOST, name: 'Bu Fahad', seat: null },
  { id: OMAR, name: 'Omar', seat: null },
];

describe('(1) Score: people come in by tapping a name or typing one, no dropdowns', () => {
  it('has no dropdown and no "someone else" anywhere on the page, even with two tables to pick from', async () => {
    api.scoreTargets.mockResolvedValue({
      targets: [
        { diwaniya_id: DW, name: 'Diwaniya Al-Bahar', table_id: TB, game: 'kout', seat_count: 4, label: 'A', starts_at: '2026-11-18T18:00:00Z', why: 'seated' },
        { diwaniya_id: DW, name: 'Diwaniya Al-Bahar', table_id: null, game: null, seat_count: null, label: null, starts_at: null, why: 'host' },
      ],
      reason: null,
    });
    api.openSheet.mockResolvedValue(null);
    api.getOpenNight.mockResolvedValue(seatsAt([{ seat_no: 1, user_id: ME, walk_in_name: null, profile: { display_name: 'Ali' } }]));
    api.scoreRoster.mockResolvedValue(roster);
    const { container } = withAll(<Score />);
    await screen.findByRole('button', { name: en.score.start });
    expect(container.querySelectorAll('select').length).toBe(0);
    expect(container.textContent).not.toMatch(/someone else/i);
    // the table switch is a row of chips now
    expect(screen.getByRole('radio', { name: new RegExp(en.scoreTab.noTable.replace(/[()]/g, '\\$&')) })).toBeTruthy();
  });
  it('seats the people already at the table, then a tap on a name from the room fills the next empty seat', async () => {
    api.openSheet.mockResolvedValue(null);
    api.getOpenNight.mockResolvedValue(
      seatsAt([
        { seat_no: 1, user_id: ME, walk_in_name: null, profile: { display_name: 'Ali' } },
        { seat_no: 2, user_id: null, walk_in_name: 'Tariq' },
      ]),
    );
    api.scoreRoster.mockResolvedValue(roster);
    api.startScore.mockResolvedValue('s1');
    api.getSheet.mockResolvedValue({ sheet: null, rounds: [] });
    withAll(<Score id={DW} table={TB} />);
    const p1 = (await screen.findByLabelText('Player 1')) as HTMLInputElement;
    await waitFor(() => expect(p1.value).toBe('Ali'));
    expect((screen.getByLabelText('Player 2') as HTMLInputElement).value).toBe('Tariq');
    const room = screen.getByRole('group', { name: en.roster.room });
    // Ali is seated already, so the room offers the others
    expect(within(room).queryByRole('button', { name: en.roster.add('Ali') })).toBeNull();
    fireEvent.click(within(room).getByRole('button', { name: en.roster.add('Bu Fahad') }));
    expect((screen.getByLabelText('Player 3') as HTMLInputElement).value).toBe('Bu Fahad');
    // typing a name: Omar typed by hand still links to his account
    fireEvent.change(screen.getByLabelText('Player 4'), { target: { value: 'omar' } });
    fireEvent.click(screen.getByRole('button', { name: en.score.start }));
    await waitFor(() => expect(api.startScore).toHaveBeenCalled());
    const players = api.startScore.mock.calls[0][3] as { user_id: string | null; name: string }[];
    expect(players.map((p) => p.user_id)).toEqual([ME, null, HOST, OMAR]);
    expect(players[1].name).toBe('Tariq');
  });
  it('a tapped name goes to the seat you are on, and the clear button empties a seat', async () => {
    api.openSheet.mockResolvedValue(null);
    api.getOpenNight.mockResolvedValue(seatsAt([]));
    api.scoreRoster.mockResolvedValue(roster);
    withAll(<Score id={DW} table={TB} />);
    const p3 = (await screen.findByLabelText('Player 3')) as HTMLInputElement;
    fireEvent.focus(p3);
    fireEvent.click(screen.getByRole('button', { name: en.roster.add('Omar') }));
    expect(p3.value).toBe('Omar');
    fireEvent.click(screen.getByRole('button', { name: en.roster.clear('3') }));
    expect(p3.value).toBe('');
    // a name typed in a seat is never overwritten by a tap while another seat is free
    const p1 = screen.getByLabelText('Player 1') as HTMLInputElement;
    fireEvent.focus(p1);
    fireEvent.change(p1, { target: { value: 'Tariq' } });
    fireEvent.click(screen.getByRole('button', { name: en.roster.add('Omar') }));
    expect(p1.value).toBe('Tariq');
    expect((screen.getByLabelText('Player 2') as HTMLInputElement).value).toBe('Omar');
  });
  it('keeps the duplicate check: the same person typed twice stops the start', async () => {
    api.openSheet.mockResolvedValue(null);
    api.getOpenNight.mockResolvedValue(seatsAt([{ seat_no: 1, user_id: ME, walk_in_name: null, profile: { display_name: 'Ali' } }]));
    api.scoreRoster.mockResolvedValue(roster);
    withAll(<Score id={DW} table={TB} />);
    await waitFor(async () => expect(((await screen.findByLabelText('Player 1')) as HTMLInputElement).value).toBe('Ali'));
    fireEvent.change(screen.getByLabelText('Player 2'), { target: { value: 'ali' } });
    fireEvent.change(screen.getByLabelText('Player 3'), { target: { value: 'Mo' } });
    fireEvent.change(screen.getByLabelText('Player 4'), { target: { value: 'Jo' } });
    fireEvent.click(screen.getByRole('button', { name: en.score.start }));
    expect(await screen.findByText(en.roster.twice('2'))).toBeTruthy();
    expect(api.startScore).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ (2) language bug
describe('(2) opening Me for the first time keeps the language the person chose', () => {
  it('the account\'s old saved language does not overwrite the device\'s choice', async () => {
    api.amIAdmin.mockResolvedValue(false);
    api.myCohostInvites.mockResolvedValue([]);
    api.updatePrivate.mockResolvedValue(undefined);
    savePrefs({ lang: 'ar', numerals: 'auto', theme: 'auto' }); // he chose Arabic on this phone
    let now: Prefs = DEFAULT_PREFS;
    render(
      <LivePrefs seen={(p) => (now = p)}>
        <SessionContext.Provider value={ready('en')}>
          <UnreadContext.Provider value={{ inbox: 0, messages: 0 }}>
            <PrefsSync />
            <Me />
          </UnreadContext.Provider>
        </SessionContext.Provider>
      </LivePrefs>,
    );
    await screen.findByText('Ali');
    await new Promise((r) => setTimeout(r, 20));
    expect(now.lang).toBe('ar');
    expect(loadPrefs().lang).toBe('ar');
    // and the account now remembers Arabic, so pings and other phones follow it
    await waitFor(() => expect(api.updatePrivate).toHaveBeenCalledWith({ lang: 'ar' }));
  });
  it('a language switch anywhere (Welcome, Me) is saved to the account once, not only from Me', async () => {
    api.updatePrivate.mockResolvedValue(undefined);
    let setter: (p: Partial<Prefs>) => void = () => {};
    function Grab() {
      const ctx = React.useContext(PrefsContext);
      setter = ctx.setPrefs;
      return null;
    }
    render(
      <LivePrefs seen={() => {}}>
        <SessionContext.Provider value={ready('ar')}>
          <PrefsSync />
          <Grab />
        </SessionContext.Provider>
      </LivePrefs>,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(api.updatePrivate).not.toHaveBeenCalled(); // nothing to fix: device and account agree
    setter({ lang: 'en' });
    await waitFor(() => expect(api.updatePrivate).toHaveBeenCalledWith({ lang: 'en' }));
    expect(api.updatePrivate).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------ (3) Diwaniya page
const dw = (extra: Record<string, unknown> = {}) => ({
  id: DW,
  name: 'Diwaniya Al-Bahar',
  area: 'السالمية',
  usual_slot: 'Thursday 9pm',
  host_id: ME,
  visibility: 'public',
  about: 'Kout nights since 1990',
  rules: 'No stakes',
  approval: 'host',
  guest_cap: 6,
  pin_unlock_minutes: 60,
  messages_on: true,
  host: { display_name: 'Ali' },
  ...extra,
});
function hostPage(extra: Record<string, unknown> = {}) {
  api.myDiwaniyas.mockResolvedValue([dw(extra)]);
  api.getOpenNight.mockResolvedValue(seatsAt([]));
  api.getPin.mockResolvedValue({ lat: 29.3375, lng: 47.98, directions: 'Gate 2', address: 'Block 3' });
  api.listRegulars.mockResolvedValue([]);
  api.listCohosts.mockResolvedValue([]);
  api.listRequests.mockResolvedValue([]);
  api.listAnnouncements.mockResolvedValue([]);
  api.lastNightAt.mockResolvedValue(null);
  api.followerCount.mockResolvedValue(0);
  api.updateDiwaniya.mockResolvedValue(undefined);
  api.setPin.mockResolvedValue(undefined);
}

describe('(3) Diwaniya page: settings in Tonight at the top, dropdowns shown, Location last, one Save', () => {
  it('Tonight (with the settings first inside it) leads, Location is the last part, Settings is gone as its own part', async () => {
    hostPage();
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    const parts = [...document.querySelectorAll('.dw-part__title')].map((h) => h.textContent);
    expect(parts).toEqual([en.page.tonight, en.page.requests, en.page.tables, en.page.people, en.page.rules, en.page.location]);
    const tonight = document.querySelector('#dw-tonight-t')!.closest('section')!;
    const fields = [...tonight.querySelectorAll('.edit-row__label, .dw-field__label')].map((x) => x.textContent);
    expect(fields.slice(0, 3)).toEqual([en.board.name, en.profile.area, en.settings.usualSlot]);
    // the night controls come after the settings, inside the same part
    const order = tonight.innerHTML.indexOf(en.settings.visibility) < tonight.innerHTML.indexOf(en.board.closeNight);
    expect(order).toBe(true);
  });
  it('list fields are dropdowns on the page, with no pencil', async () => {
    hostPage();
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    for (const label of [en.profile.area, en.settings.visibility, en.settings.approval, en.messages.setting]) {
      expect(screen.getByLabelText(label).tagName).toBe('SELECT');
      expect(screen.queryByRole('button', { name: new RegExp(`^${en.page.edit(label)}`) })).toBeNull();
    }
  });
  it('one Save at the bottom saves every change together; nothing saves before it', async () => {
    hostPage();
    const { container } = withAll(<Board />);
    await screen.findByText(en.board.addTable);
    const saves = () => screen.getAllByRole('button', { name: en.common.save });
    expect(saves()).toHaveLength(1);
    expect((saves()[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(en.settings.visibility), { target: { value: 'followers' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.rules)}`) }));
    fireEvent.change(screen.getByLabelText(en.settings.rules), { target: { value: 'Respect first' } });
    expect(saves()).toHaveLength(1); // the open row has no Save of its own
    expect(api.updateDiwaniya).not.toHaveBeenCalled();
    const save = saves()[0];
    // it is the page's last control
    const all = [...container.querySelectorAll('.dw-page button, .dw-page select, .dw-page input, .dw-page textarea, .dw-page a')];
    expect(all[all.length - 1]).toBe(save);
    fireEvent.click(save);
    await waitFor(() => expect(api.updateDiwaniya).toHaveBeenCalledWith(DW, { visibility: 'followers', rules: 'Respect first' }));
    expect(api.updateDiwaniya).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(en.common.saved)).toBeTruthy();
  });
  it('red Cancel on a row puts that field back; the address change is saved with the same Save', async () => {
    hostPage();
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.usualSlot)}`) }));
    fireEvent.change(screen.getByLabelText(new RegExp(`^${en.settings.usualSlot}`)), { target: { value: 'Friday' } });
    const cancel = screen.getByRole('button', { name: en.page.cancel });
    expect(cancel.className).toContain('btn--danger');
    fireEvent.click(cancel);
    expect(screen.getAllByText('Thursday 9pm').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.address)}`) }));
    fireEvent.change(screen.getByLabelText(new RegExp(`^${en.settings.address}`)), { target: { value: 'Block 4' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(api.setPin).toHaveBeenCalledWith(DW, 29.3375, 47.98, 'Gate 2', 'Block 4'));
    expect(api.updateDiwaniya).not.toHaveBeenCalled();
  });
  it('a co-host sees the facts as text: no dropdowns for settings and no Save', async () => {
    hostPage({ host_id: HOST });
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    expect(screen.queryByLabelText(en.settings.visibility)).toBeNull();
    expect(screen.queryByRole('button', { name: en.common.save })).toBeNull();
    expect(screen.getAllByText(en.settings.visibilityOpts.public).length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ (4) Tonight filters
const night = (id: string, area: string, game: 'kout' | 'baloot' = 'kout') => ({
  id,
  starts_at: '2026-11-18T18:00:00Z',
  status: 'open' as const,
  diwaniya: { id: `d-${id}`, name: `Diwaniya ${id}`, area, usual_slot: '', host_id: HOST, visibility: 'public' as const },
  tables: [{ id: `t-${id}`, game, seat_count: 4, label: 'A', queue_mode: 'rotation' as const, need_one: false, seats: [], queue: [] }],
});

describe('(4) Tonight: filter by location and by game', () => {
  const list = [night('a', 'السالمية'), night('b', 'الجابرية', 'baloot'), night('c', 'الجهراء')];
  it('filters by any governorate or any area, and by game', () => {
    expect(filterNights(list, [], 'all').map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(filterNights(list, [], 'gov:hawalli').map((n) => n.id)).toEqual(['a', 'b']);
    expect(filterNights(list, [], 'area:الجهراء').map((n) => n.id)).toEqual(['c']);
    expect(filterNights(list, ['baloot'], 'all').map((n) => n.id)).toEqual(['b']);
    expect(filterNights(list, ['baloot'], 'gov:jahra')).toEqual([]);
  });
  it('the location list offers the places with a night tonight, with counts, by governorate', () => {
    const opts = locationOptions(list, 'en');
    expect(opts.map((g) => g.value)).toEqual(['gov:hawalli', 'gov:jahra']);
    expect(opts[0].label).toBe('All of Hawalli (2)');
    expect(opts[0].areas.map((a) => a.label)).toEqual(['Jabriya (1)', 'Salmiya (1)']);
  });
  it('shows a Location dropdown and the game chips; the old open-seats and my-area options are gone', async () => {
    api.listTonight.mockResolvedValue(list);
    api.myDiwaniyaList.mockResolvedValue([]);
    withAll(<Tonight />);
    const where = (await screen.findByLabelText(en.tonight.where)) as HTMLSelectElement;
    expect(where.tagName).toBe('SELECT');
    expect(screen.queryByText(en.tonight.openOnly)).toBeNull();
    expect(screen.queryByText(en.quick.scopeGov)).toBeNull();
    fireEvent.change(where, { target: { value: 'gov:jahra' } });
    expect(await screen.findByText('Diwaniya c')).toBeTruthy();
    expect(screen.queryByText('Diwaniya a')).toBeNull();
    expect(localStorage.getItem('dt.tonight.where.v1')).toBe('gov:jahra');
    fireEvent.change(where, { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Baloot' }));
    expect(await screen.findByText('Diwaniya b')).toBeTruthy();
    expect(screen.queryByText('Diwaniya a')).toBeNull();
  });
});

