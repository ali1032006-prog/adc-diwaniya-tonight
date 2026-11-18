import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import migration from '../supabase/migrations/20261118073915_ali_change_list.sql?raw';
import headers from '../public/_headers?raw';
import { PrefsContext, DEFAULT_PREFS, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { COPY } from './lib/copy';
import { STRINGS } from './lib/i18n';
import { GOVERNORATES, areaLabel, areaValue, governorateOf } from './lib/areas';
import { googleMapsUrl, inKuwait, project, tilesFor, unproject, KUWAIT_CENTER } from './components/Map';

// Ali's change list (ADC-LOG-754): areas, league, guest scoring, map, My diwaniyas, Me/S9, fewer taps.
// The server rules are tested in supabase/tests/ali_changes_test.sql; this file covers what the app shows.
const api = vi.hoisted(() => ({
  scoreRoster: vi.fn(),
  getOpenNight: vi.fn(),
  recordGame: vi.fn(),
  undoGame: vi.fn(),
  myDiwaniyaList: vi.fn(),
  listTonight: vi.fn(),
  checkIn: vi.fn(),
  standings: vi.fn(),
  recentGames: vi.fn(),
  leagueDiwaniyas: vi.fn(),
  listInbox: vi.fn(),
  requestStatuses: vi.fn(),
  decideRequest: vi.fn(),
  markRead: vi.fn(),
  amIAdmin: vi.fn(),
  listBlocked: vi.fn(),
  myCohostInvites: vi.fn(),
  getDiwaniya: vi.fn(),
  getPin: vi.fn(),
  listRegulars: vi.fn(),
  listCohosts: vi.fn(),
  openSheet: vi.fn(),
  startScore: vi.fn(),
  getSheet: vi.fn(),
  myDiwaniyas: vi.fn(),
  followerCount: vi.fn(),
  lastNightAt: vi.fn(),
  listRequests: vi.fn(),
  listAnnouncements: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { ApiError } = await import('./lib/api');
const { linkToRoster, duplicateSeats, Score } = await import('./screens/Score');
const { filterNights, sitTarget, Tonight } = await import('./screens/Tonight');
const { League } = await import('./screens/League');
const { Inbox } = await import('./screens/Inbox');
const { Me } = await import('./screens/Me');
const { Board } = await import('./screens/Board');
const { ME_SECTIONS, parseHash } = await import('./lib/router');

const ME = '11111111-1111-4111-8111-111111111111';
const HOST = '33333333-3333-4333-8333-333333333333';
const DW = '22222222-2222-4222-8222-222222222222';
const NIGHT = '44444444-4444-4444-8444-444444444444';
const TB = '55555555-5555-4555-8555-555555555555';
const en = COPY.en;

const ready: SessionCtx = {
  status: 'ready',
  userId: ME,
  email: 'me@example.invalid',
  provider: 'google',
  profile: { id: ME, display_name: 'Ali', area: 'السالمية', games: ['kout'], created_at: '2026-11-01T10:00:00Z' },
  priv: {
    birth_date: '1990-01-01',
    terms_accepted_at: '2026-11-01T10:00:00Z',
    male_confirmed_at: null,
    lang: 'en',
    numerals: 'auto',
    theme: 'auto',
    ping_games: [],
    ping_areas: ['السالمية'],
    quiet_start: null,
    quiet_end: null,
    ping_daily_cap: 3,
  },
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
};

function withAll(ui: React.ReactNode, session: SessionCtx = ready, prefs: Partial<Prefs> = { lang: 'en' }) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={session}>{ui}</SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const night = (area: string, extra: Partial<{ id: string; host: string; seats: { seat_no: number; user_id: string | null; walk_in_name: string | null }[] }> = {}) => ({
  id: extra.id ?? NIGHT,
  starts_at: '2026-11-18T18:00:00Z',
  status: 'open' as const,
  diwaniya: { id: DW, name: 'Diwaniya Al-Bahar', area, usual_slot: '', host_id: extra.host ?? HOST, visibility: 'public' as const },
  tables: [{ id: TB, game: 'kout' as const, seat_count: 4, label: 'A', queue_mode: 'rotation' as const, need_one: false, seats: extra.seats ?? [], queue: [] }],
});

describe('(1) areas: Kuwait governorates and areas', () => {
  it('has six governorates and the same list the database checks against', () => {
    expect(GOVERNORATES.map((g) => g.key)).toEqual(['capital', 'hawalli', 'farwaniya', 'mubarak', 'ahmadi', 'jahra']);
    const rows = [...migration.matchAll(/^\s+\('([^']+)', '([^']+)', '([a-z]+)', (\d+)\)[,;]$/gm)].map((m) => [m[1], m[2], m[3]]);
    const ts = GOVERNORATES.flatMap((g) => g.areas.map((a) => [a.ar, a.en, g.key]));
    expect(rows.length).toBeGreaterThan(100);
    expect(rows).toEqual(ts);
  });
  it('maps English names to the stored Arabic name and labels by language', () => {
    expect(areaValue(' salmiya ')).toBe('السالمية');
    expect(areaLabel('السالمية', 'en')).toBe('Salmiya');
    expect(areaLabel('Salmiya', 'ar')).toBe('السالمية');
    expect(governorateOf('الفنطاس')).toBe('ahmadi');
    expect(areaLabel('Somewhere old', 'en')).toBe('Somewhere old');
  });
  it('filters Tonight to my area or my governorate', () => {
    const list = [night('السالمية', { id: 'a' }), night('الجابرية', { id: 'b' }), night('الجهراء', { id: 'c' })];
    expect(filterNights(list, [], false, 'area', 'Salmiya').map((n) => n.id)).toEqual(['a']);
    expect(filterNights(list, [], false, 'gov', 'السالمية').map((n) => n.id)).toEqual(['a', 'b']);
    expect(filterNights(list, [], false, 'all', 'السالمية').map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
  it('S3 and Me pick the area from a grouped dropdown, not a text box', async () => {
    api.listBlocked.mockResolvedValue([]);
    api.amIAdmin.mockResolvedValue(false);
    api.myCohostInvites.mockResolvedValue([]);
    const { container } = withAll(<Me section="account" />);
    const area = container.querySelector('select[required]') as HTMLSelectElement;
    expect(area.tagName).toBe('SELECT');
    expect(area.value).toBe('السالمية');
    expect(area.querySelectorAll('optgroup')).toHaveLength(6);
    expect(container.querySelector('input[maxlength="300"]')).toBeNull(); // the old comma-list ping areas box
  });
});

describe('(3) a scored game reaches the league', () => {
  const roster = [
    { id: ME, name: 'Ali', seat: null },
    { id: HOST, name: 'Tariq', seat: 2 },
  ];
  it('links a typed name that is someone on the roster (Ali typed "Ali" and his win went nowhere)', () => {
    const linked = linkToRoster(
      [
        { user_id: null, name: ' ali ' },
        { user_id: null, name: 'Bader' },
      ],
      roster,
    );
    expect(linked).toEqual([
      { user_id: ME, name: 'Ali' },
      { user_id: null, name: 'Bader' },
    ]);
  });
  it('finds a player sitting twice (Tariq at seats 4 and 5 in Ali\'s test game)', () => {
    expect(duplicateSeats([{ user_id: null, name: 'Tariq' }, { user_id: null, name: 'Mo' }, { user_id: null, name: 'tariq' }])).toEqual([3]);
    expect(duplicateSeats([{ user_id: ME, name: 'Ali' }, { user_id: ME, name: 'Ali' }])).toEqual([2]);
  });
  it('the score sheet seats me by account and sends user ids, not typed names', async () => {
    api.getOpenNight.mockResolvedValue(null);
    api.scoreRoster.mockResolvedValue(roster);
    api.openSheet.mockResolvedValue(null);
    api.startScore.mockResolvedValue('s1');
    api.getSheet.mockResolvedValue({ sheet: null, rounds: [] });
    withAll(<Score id={DW} />);
    const seat1 = (await screen.findByLabelText('Player 1')) as HTMLSelectElement;
    await waitFor(() => expect(seat1.value).toBe(ME));
    fireEvent.change(screen.getByLabelText('Player 2'), { target: { value: HOST } });
    for (const n of [3, 4, 5, 6]) {
      fireEvent.change(screen.getByLabelText(`Player ${n}`), { target: { value: '__walk_in__' } });
      fireEvent.change(screen.getByLabelText(en.roster.walkInName(String(n))), { target: { value: `Guest ${n}` } });
    }
    // Live scoring (ADC-LOG-764 item 3): the seats go to the score sheet when the game starts.
    fireEvent.click(screen.getByRole('button', { name: en.score.start }));
    await waitFor(() => expect(api.startScore).toHaveBeenCalled());
    const results = api.startScore.mock.calls[0][3] as { user_id: string | null; name: string; team: number }[];
    expect(results.map((r) => r.team)).toEqual([1, 2, 1, 2, 1, 2]);
    expect(results[0].user_id).toBe(ME);
    expect(results[1].user_id).toBe(HOST);
    expect(results[2]).toMatchObject({ user_id: null, name: 'Guest 3' });
  });
  it('the season shows walk-ins too, marked as guests and without a profile link', async () => {
    localStorage.setItem('dt.league.view.v1', 'season');
    api.leagueDiwaniyas.mockResolvedValue([{ id: DW, name: 'Diwaniya Al-Bahar' }]);
    api.standings.mockResolvedValue([
      { diwaniya_id: DW, user_id: ME, name: 'Ali', played: 2, wins: 2, player_key: ME },
      { diwaniya_id: DW, user_id: null, name: 'Tariq', played: 2, wins: 1, player_key: 'guest:tariq' },
    ]);
    api.recentGames.mockResolvedValue([]);
    withAll(<League />);
    const row = (await screen.findByText('Tariq')).closest('tr')!;
    expect(within(row).queryByRole('link')).toBeNull();
    expect(within(row).getByText(en.mine.walkIn)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ali' }).getAttribute('href')).toBe(`#/player/${ME}`);
    expect(screen.queryByRole('link', { name: STRINGS.en.league.score })).toBeNull(); // Score is only the middle tab now (ADC-LOG-781 item 3)
  });
});

describe('(4) guests checked in score their table', () => {
  it('says who may score when the server refuses the roster', async () => {
    api.getOpenNight.mockResolvedValue(null);
    api.openSheet.mockResolvedValue(null);
    api.scoreRoster.mockRejectedValue(new ApiError('42501', 'only its managers, regulars and guests checked in tonight can score here'));
    withAll(<Score id={DW} />);
    expect(await screen.findByText(en.roster.notAllowed)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.score.start })).toBeNull();
  });
});

describe('(5) the map', () => {
  it('projects and back to 5 decimals', () => {
    const p = { lat: 29.3375, lng: 47.98 };
    for (const z of [11, 16, 18]) {
      const w = project(p, z);
      expect(unproject(w.x, w.y, z)).toEqual(p);
    }
  });
  it('asks only for the tiles in view (the OSM policy forbids prefetch)', () => {
    const tiles = tilesFor(KUWAIT_CENTER, 16, 390, 240);
    expect(tiles.length).toBeLessThanOrEqual(6);
    expect(tiles.every((t) => t.src.startsWith('https://tile.openstreetmap.org/16/'))).toBe(true);
  });
  it('keeps pins inside Kuwait and links to Google Maps', () => {
    expect(inKuwait({ lat: 29.3, lng: 48 })).toBe(true);
    expect(inKuwait({ lat: 51.5, lng: -0.12 })).toBe(false);
    expect(googleMapsUrl({ lat: 29.3375, lng: 47.98 })).toBe('https://www.google.com/maps/search/?api=1&query=29.33750,47.98000');
  });
  it('allows the tile host for images only, and location for this site only', () => {
    const csp = headers.split('\n').find((l) => l.includes('Content-Security-Policy'))!;
    expect(csp).toMatch(/img-src 'self' data: blob: https:\/\/tile\.openstreetmap\.org;/);
    expect(csp.match(/tile\.openstreetmap\.org/g)).toHaveLength(1);
    expect(headers).toMatch(/geolocation=\(self\)/);
  });
  it('the Diwaniya page has no latitude or longitude boxes: tap Address for the map, my-location and the directions', async () => {
    api.myDiwaniyas.mockResolvedValue([{ id: DW, name: 'D', area: 'السالمية', usual_slot: '', host_id: ME, visibility: 'public', about: '', rules: '', approval: 'host', guest_cap: 4, pin_unlock_minutes: 60, messages_on: true }]);
    api.getOpenNight.mockResolvedValue(null);
    api.followerCount.mockResolvedValue(0);
    api.lastNightAt.mockResolvedValue(null);
    api.getPin.mockResolvedValue({ lat: 29.3375, lng: 47.98, directions: 'Gate 2', address: '' });
    api.listRegulars.mockResolvedValue([]);
    api.listCohosts.mockResolvedValue([]);
    const { container } = withAll(<Board />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.address)}`) }));
    expect(await screen.findByRole('button', { name: en.map.useMine })).toBeTruthy();
    expect(screen.queryByLabelText(/latitude|longitude/i)).toBeNull();
    const imgs = [...container.querySelectorAll('img.map__tile')];
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.every((i) => i.getAttribute('referrerpolicy') === 'strict-origin-when-cross-origin')).toBe(true);
    expect(screen.getAllByRole('link', { name: en.map.osm })[0].getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
  });
});

describe('(6) My diwaniyas', () => {
  it('lists each with tonight\'s state and my request, inside League', async () => {
    api.myDiwaniyaList.mockResolvedValue([
      { id: DW, name: 'Diwaniya Al-Bahar', area: 'السالمية', visibility: 'public', why: ['follow'], night_id: NIGHT, starts_at: '2026-11-18T18:00:00Z', open_seats: 2, need_one: true, my_status: 'approved', my_request: 'r', my_table: TB, seated_table: null },
      { id: HOST, name: 'Diwaniya Closed', area: 'الجهراء', visibility: 'public', why: ['regular'], night_id: null, starts_at: null, open_seats: null, need_one: null, my_status: null, my_request: null, my_table: null, seated_table: null },
    ]);
    withAll(<League />);
    const open = (await screen.findByText('Diwaniya Al-Bahar')).closest('li')!;
    expect(within(open).getByText(en.status.approved)).toBeTruthy();
    expect(within(open).getByText('2 seats open')).toBeTruthy();
    expect(within(open).getByText('Salmiya')).toBeTruthy();
    const closed = screen.getByText('Diwaniya Closed').closest('li')!;
    expect(within(closed).getByText(en.mine.closed)).toBeTruthy();
    expect(screen.getByRole('tab', { name: en.mine.title }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('(2) Me and S9: a menu of buttons, one page per section (ADC-LOG-764 item 7)', () => {
  it('Me is a menu: preferences, account, pings, privacy, data, then deleting apart; no jump row', async () => {
    api.amIAdmin.mockResolvedValue(false);
    api.myCohostInvites.mockResolvedValue([]);
    withAll(<Me />);
    const links = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(links).toEqual(ME_SECTIONS.map((x) => `#/me/${x}`));
    expect(screen.queryByRole('navigation', { name: en.sections.jump })).toBeNull();
    expect(screen.getByRole('button', { name: en.me.signOut })).toBeTruthy();
    // nothing of a section shows on the menu itself
    expect(screen.queryByText('English')).toBeNull();
  });
  it('a Me section opens on its own page with back to the menu', async () => {
    const { container } = withAll(<Me section="prefs" />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(STRINGS.en.me.preferences);
    expect(screen.getByRole('button', { name: en.common.back })).toBeTruthy();
    expect(container.querySelectorAll('form')).toHaveLength(0);
  });
  it('the old S9 settings pages are retired into the one Diwaniya page (Ali\'s change list 3, item 4)', async () => {
    expect(parseHash(`#/settings/${DW}`)).toEqual({ name: 'diwaniya', id: DW });
    expect(parseHash(`#/settings/${DW}/joining`)).toEqual({ name: 'diwaniya', id: DW });
  });
});

describe('(7) fewer taps', () => {
  it('Tonight: request from the card, sit or score from Your night', async () => {
    api.listTonight.mockResolvedValue([night('السالمية')]);
    api.myDiwaniyaList.mockResolvedValue([]);
    withAll(<Tonight />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${en.place.request}`) }));
    await waitFor(() => expect(document.querySelector('dialog.sheet')).not.toBeNull());
    expect(screen.getByRole('button', { name: en.requestSheet.send, hidden: true })).toBeTruthy();
  });
  it('Your night seats an approved guest with one tap', async () => {
    api.listTonight.mockResolvedValue([night('السالمية')]);
    api.myDiwaniyaList.mockResolvedValue([
      { id: DW, name: 'Diwaniya Al-Bahar', area: 'السالمية', visibility: 'public', why: ['tonight'], night_id: NIGHT, starts_at: '2026-11-18T18:00:00Z', open_seats: 4, need_one: false, my_status: 'approved', my_request: 'r', my_table: TB, seated_table: null },
    ]);
    api.getOpenNight.mockResolvedValue(night('السالمية', { seats: [{ seat_no: 1, user_id: HOST, walk_in_name: null }] }));
    api.checkIn.mockResolvedValue('s');
    withAll(<Tonight />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${en.quick.sitNow}`) }));
    await waitFor(() => expect(api.checkIn).toHaveBeenCalledWith(TB, 2));
  });
  it('picks the first free seat at the requested table, else any table', () => {
    const n = night('السالمية', { seats: [{ seat_no: 1, user_id: HOST, walk_in_name: null }] });
    expect(sitTarget(n as never, TB)).toEqual({ table: TB, seat: 2, game: 'kout' });
    expect(sitTarget(null, TB)).toBeNull();
  });
  it('Inbox approves a waiting request in place', async () => {
    api.listInbox.mockResolvedValue([
      { id: 'i1', kind: 'request', diwaniya_id: DW, night_id: NIGHT, request_id: 'r1', table_id: null, created_at: '2026-11-18T07:00:00Z', read_at: null, diwaniya: { name: 'Diwaniya Al-Bahar' } },
      { id: 'i2', kind: 'request', diwaniya_id: DW, night_id: NIGHT, request_id: 'r2', table_id: null, created_at: '2026-11-18T06:00:00Z', read_at: null, diwaniya: { name: 'Diwaniya Al-Bahar' } },
    ]);
    api.requestStatuses.mockResolvedValue(new Map([['r1', 'pending'], ['r2', 'approved']]));
    api.decideRequest.mockResolvedValue('approved');
    api.markRead.mockResolvedValue(undefined);
    withAll(<Inbox />);
    const approve = await screen.findAllByRole('button', { name: new RegExp(`^${en.board.approve}`) });
    expect(approve).toHaveLength(1); // r2 was already decided
    fireEvent.click(approve[0]);
    await waitFor(() => expect(api.decideRequest).toHaveBeenCalledWith('r1', true));
  });
});
