import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, errorText, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { parseHash, tabOf } from './lib/router';
import { COPY } from './lib/copy';
import type { NightRow, PlayedGame, Standing, TableRow } from './lib/api';

// Screens talk to ./lib/api; here every call is a spy so the UI can be driven without a backend.
const api = vi.hoisted(() => ({
  listTonight: vi.fn(),
  myDiwaniyas: vi.fn(),
  listFollowed: vi.fn(),
  getOpenNight: vi.fn(),
  listRequests: vi.fn(),
  decideRequest: vi.fn(),
  listInbox: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { ApiError, monthlyCrown, rankStandings, openSeats } = await import('./lib/api');
const { filterNights, Tonight } = await import('./screens/Tonight');
const { buildResults, packForTable, teamOf, playersFor } = await import('./screens/Score');
const { kuwaitStart, Board } = await import('./screens/Board');
const { inboxTarget, Inbox } = await import('./screens/Inbox');
const { initials } = await import('./components/ui');
const { ringSeats } = await import('./components/account');

const ME = '11111111-1111-4111-8111-111111111111';
const DW = '22222222-2222-4222-8222-222222222222';
const NIGHT = '33333333-3333-4333-8333-333333333333';
const T1 = '44444444-4444-4444-8444-444444444444';

const ready: SessionCtx = {
  status: 'ready',
  userId: ME,
  email: 'me@example.invalid',
  provider: 'email',
  profile: { id: ME, display_name: 'Faisal', area: 'Salmiya', games: ['kout'], created_at: '2026-11-01T10:00:00Z' },
  priv: {
    birth_date: '1990-01-01',
    terms_accepted_at: '2026-11-01T10:00:00Z',
    male_confirmed_at: '2026-11-01T10:00:00Z',
    lang: 'en',
    numerals: 'auto',
    theme: 'auto',
    ping_games: [],
    ping_areas: [],
    quiet_start: null,
    quiet_end: null,
    ping_daily_cap: 3,
  },
  refresh: async () => {},
  signOut: async () => {},
};

function table(over: Partial<TableRow> = {}): TableRow {
  return { id: T1, game: 'kout', seat_count: 6, label: '', queue_mode: 'rotation', need_one: false, seats: [], queue: [], ...over };
}

function night(over: Partial<NightRow> = {}): NightRow {
  return {
    id: NIGHT,
    starts_at: '2026-11-17T18:30:00Z',
    status: 'open',
    diwaniya: { id: DW, name: 'Diwaniya Al-Bahar', area: 'Salmiya', usual_slot: '', host_id: 'h', visibility: 'public' },
    tables: [table()],
    ...over,
  };
}

function withAll(ui: React.ReactNode, session: SessionCtx = ready, prefs: Partial<Prefs> = { lang: 'en' }) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe('router (slice 3 routes)', () => {
  it('parses pushed screens by uuid and refuses malformed ids', () => {
    expect(parseHash(`#/d/${DW}`)).toEqual({ name: 'place', id: DW });
    expect(parseHash(`#/settings/${DW}`)).toEqual({ name: 'settings', id: DW });
    expect(parseHash(`#/player/${ME}`)).toEqual({ name: 'player', id: ME });
    expect(parseHash(`#/score/${DW}?table=${T1}`)).toEqual({ name: 'score', id: DW, table: T1 });
    expect(parseHash(`#/score/${DW}?table=nope`)).toEqual({ name: 'score', id: DW });
    expect(parseHash('#/d/not-a-uuid')).toEqual({ name: 'tonight' });
    expect(parseHash('#/d/<script>')).toEqual({ name: 'tonight' });
  });
  it('keeps the pill on the tab a pushed screen came from', () => {
    expect(tabOf({ name: 'place', id: DW }, 'inbox')).toBe('inbox');
    expect(tabOf({ name: 'place', id: DW }, 'league')).toBe('tonight');
    expect(tabOf({ name: 'settings', id: DW })).toBe('diwaniya');
    expect(tabOf({ name: 'player', id: ME }, 'me')).toBe('league');
  });
});

describe('pure helpers', () => {
  it('counts open seats and filters nights by game and open seats', () => {
    const full = table({ id: 'full', game: 'baloot', seat_count: 4, seats: [1, 2, 3, 4].map((n) => ({ seat_no: n, user_id: null, walk_in_name: 'x' })) });
    expect(openSeats(full)).toBe(0);
    const a = night({ id: 'a', tables: [full] });
    const b = night({ id: 'b', tables: [table()] });
    expect(filterNights([a, b], [], true).map((n) => n.id)).toEqual(['b']);
    expect(filterNights([a, b], ['baloot'], false).map((n) => n.id)).toEqual(['a']);
    expect(filterNights([a, b], ['trix'], false)).toEqual([]);
  });
  it('builds ring seats in seat order with mine marked', () => {
    const t = table({ seat_count: 4, game: 'baloot', seats: [{ seat_no: 3, user_id: ME, walk_in_name: null, profile: { display_name: 'Faisal Ali' } }] });
    expect(ringSeats(t, ME)).toEqual([null, null, { initials: 'FA', mine: true }, null]);
    expect(initials('  ')).toBe('؟');
    expect(initials('عبدالله محمد')).toBe('عم');
  });
  it('seats partners across: alternating teams, Trix every player alone', () => {
    expect(playersFor('kout_bo6')).toBe(6);
    expect([1, 2, 3, 4, 5, 6].map((s) => teamOf('kout_bo6', s))).toEqual([1, 2, 1, 2, 1, 2]);
    expect([1, 2, 3, 4].map((s) => teamOf('trix', s))).toEqual([1, 2, 3, 4]);
    expect(packForTable({ game: 'kout', seat_count: 4 })).toBe('kout_bo4');
    expect(packForTable({ game: 'tarneeb', seat_count: 4 })).toBe('tarneeb_41');
  });
  it('turns a score sheet into results for record_game', () => {
    const players = ['A', 'B', 'C', 'D'].map((name) => ({ user_id: null, name: ` ${name} ` }));
    expect(buildResults('baloot', players, [152, 90], 1)).toEqual([
      { seat: 1, user_id: null, name: 'A', team: 1, points: 152, won: true },
      { seat: 2, user_id: null, name: 'B', team: 2, points: 90, won: false },
      { seat: 3, user_id: null, name: 'C', team: 1, points: 152, won: true },
      { seat: 4, user_id: null, name: 'D', team: 2, points: 90, won: false },
    ]);
  });
  it('ranks the season by wins, then win rate, then fewer games', () => {
    const rows: Standing[] = [
      { diwaniya_id: DW, user_id: 'a', name: 'A', played: 10, wins: 5 },
      { diwaniya_id: DW, user_id: 'b', name: 'B', played: 6, wins: 5 },
      { diwaniya_id: DW, user_id: 'c', name: 'C', played: 3, wins: 7 },
    ];
    expect(rankStandings(rows).map((r) => r.user_id)).toEqual(['c', 'b', 'a']);
  });
  it('crowns the month by wins in Kuwait time and skips undone games', () => {
    const g = (at: string, winner: string, undone = false): PlayedGame => ({
      id: at,
      rule_pack: 'baloot',
      played_at: at,
      undone_at: undone ? at : null,
      recorded_by: null,
      results: [
        { seat: 1, name: winner, team: 1, points: 1, won: true, user_id: null },
        { seat: 2, name: 'loser', team: 2, points: 0, won: false, user_id: null },
      ],
    });
    const now = new Date('2026-12-01T00:30:00Z'); // 03:30 on 1 December in Kuwait
    expect(monthlyCrown([g('2026-11-30T22:00:00Z', 'Mona'), g('2026-11-30T20:00:00Z', 'Old')], now)).toEqual(['Mona']);
    expect(monthlyCrown([g('2026-11-30T22:00:00Z', 'Mona', true)], now)).toEqual([]);
  });
  it('reads the board start time as Kuwait time, rolling to tomorrow when long past', () => {
    expect(kuwaitStart('21:00', new Date('2026-11-17T12:00:00Z')).toISOString()).toBe('2026-11-17T18:00:00.000Z');
    expect(kuwaitStart('09:00', new Date('2026-11-17T18:00:00Z')).toISOString()).toBe('2026-11-18T06:00:00.000Z');
  });
  it('sends hosts to the board and guests to the diwaniya page from the inbox', () => {
    expect(inboxTarget({ kind: 'request', diwaniya_id: DW })).toBe('#/diwaniya');
    expect(inboxTarget({ kind: 'need_one', diwaniya_id: DW })).toBe(`#/d/${DW}`);
  });
  it('explains failures by SQLSTATE in both languages', () => {
    expect(errorText(new ApiError('23514', 'cap'), COPY.en)).toBe(COPY.en.errors.cap);
    expect(errorText(new ApiError('42501', 'x'), COPY.ar)).toBe(COPY.ar.errors.forbidden);
    expect(errorText(new ApiError('offline', 'x'), COPY.en)).toBe(COPY.en.errors.offline);
    expect(errorText(new Error('boom'), COPY.en)).toBe(COPY.en.errors.unknown);
  });
  it('has every slice-3 copy key in both languages', () => {
    const keys = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(COPY.en).sort()).toEqual(keys(COPY.ar).sort());
  });
});

describe('screens', () => {
  it('Tonight signed out teaches and never calls the API', () => {
    withAll(<Tonight />, { ...ready, status: 'signedOut', userId: null, profile: null, priv: null });
    // Vi's 1/3 note: signed out it must not claim there are no seats; it says sign-in shows them.
    expect(screen.getByRole('heading', { name: "Tonight's seats show once you sign in" })).toBeTruthy();
    expect(screen.queryByText('No open seats near you tonight')).toBeNull();
    expect(api.listTonight).not.toHaveBeenCalled();
  });
  it('Tonight lists open nights with their seat rings and filters by game', async () => {
    api.listTonight.mockResolvedValue([
      night(),
      night({
        id: 'n2',
        diwaniya: { id: 'd2', name: 'Baloot House', area: 'Jahra', usual_slot: '', host_id: 'h2', visibility: 'followers' },
        tables: [table({ id: 't2', game: 'baloot', seat_count: 4, need_one: true })],
      }),
    ]);
    withAll(<Tonight />);
    expect(await screen.findByText('Diwaniya Al-Bahar')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Kout table: 0 of 6 seats taken, 6 seats open' })).toBeTruthy();
    expect(screen.getByText('One short')).toBeTruthy();
    expect(screen.getByText('2 diwaniyas open tonight')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Baloot' }));
    expect(screen.queryByText('Diwaniya Al-Bahar')).toBeNull();
    expect(screen.getByText('1 diwaniya open tonight')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Baloot House/ }).getAttribute('href')).toBe('#/d/d2');
  });
  it('Tonight shows the error with a retry when loading fails', async () => {
    api.listTonight.mockRejectedValue(new ApiError('offline', 'x'));
    withAll(<Tonight />);
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't reach the server");
    api.listTonight.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'No open seats near you tonight' })).toBeTruthy();
  });
  it('Board approves a pending request through decide_request', async () => {
    api.myDiwaniyas.mockResolvedValue([
      { id: DW, name: 'Diwaniya Al-Bahar', area: 'Salmiya', usual_slot: '', host_id: ME, visibility: 'public', about: '', rules: '', approval: 'host', guest_cap: 4, pin_unlock_minutes: 60 },
    ]);
    api.listFollowed.mockResolvedValue([]);
    api.getOpenNight.mockResolvedValue(night({ diwaniya: null }));
    api.listRequests.mockResolvedValue([
      { id: 'r1', night_id: NIGHT, table_id: null, status: 'pending', eta_minutes: 15, note: 'Kout please', auto_approved: false, created_at: '2026-11-17T17:00:00Z', user: { id: 'g1', display_name: 'Salem', area: 'Jabriya' } },
    ]);
    api.decideRequest.mockResolvedValue('approved');
    withAll(<Board />);
    expect(await screen.findByText('Salem')).toBeTruthy();
    expect(screen.getByText('Waiting for the host')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.decideRequest).toHaveBeenCalledWith('r1', true));
  });
  it('Board offers to create a diwaniya when the person hosts none', async () => {
    api.myDiwaniyas.mockResolvedValue([]);
    api.listFollowed.mockResolvedValue([]);
    withAll(<Board />);
    expect(await screen.findByRole('heading', { name: 'Open your diwaniya' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create diwaniya' })).toBeTruthy();
  });
  it('Inbox marks an item read when it is opened', async () => {
    api.listInbox.mockResolvedValue([
      { id: 'i1', kind: 'approved', diwaniya_id: DW, night_id: NIGHT, request_id: 'r1', table_id: null, created_at: new Date().toISOString(), read_at: null, diwaniya: { name: 'Diwaniya Al-Bahar' } },
    ]);
    api.markRead.mockResolvedValue(undefined);
    withAll(<Inbox />);
    const link = await screen.findByRole('link', { name: /The host approved your seat at Diwaniya Al-Bahar/ });
    expect(link.getAttribute('href')).toBe(`#/d/${DW}`);
    expect(screen.getByText('1 unread')).toBeTruthy();
    fireEvent.click(link);
    expect(api.markRead).toHaveBeenCalledWith(['i1']);
  });
});
