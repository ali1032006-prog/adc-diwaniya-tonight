import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import migration from '../supabase/migrations/20261118104830_ali_change_list_2.sql?raw';
import manifest from '../public/manifest.webmanifest?raw';
import indexHtml from '../index.html?raw';
import sw from '../public/sw.js?raw';
import css from './styles.css?raw';
import { PrefsContext, DEFAULT_PREFS, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { COPY } from './lib/copy';
import { STRINGS } from './lib/i18n';
import { GUIDES, GUIDE_GAMES, gameOfPack } from './lib/guides';
import { parseHash } from './lib/router';

// Ali's change list 2 (ADC-LOG-764): (1) no repeated buttons, (2) address with the pin, (3) live
// scoring, (4) game guides, (5) logo launch then sign-in, (6) the name Diwaniyatna, (7) settings menus.
// The server rules are in supabase/tests/ali_changes2_test.sql; this file covers what the app shows.
const api = vi.hoisted(() => ({
  openSheet: vi.fn(),
  getSheet: vi.fn(),
  startScore: vi.fn(),
  addRound: vi.fn(),
  undoRound: vi.fn(),
  finishScore: vi.fn(),
  discardScore: vi.fn(),
  undoGame: vi.fn(),
  scoreRoster: vi.fn(),
  getOpenNight: vi.fn(),
  getDiwaniya: vi.fn(),
  getPin: vi.fn(),
  setPin: vi.fn(),
  updateDiwaniya: vi.fn(),
  listRegulars: vi.fn(),
  listCohosts: vi.fn(),
  getMyRequest: vi.fn(),
  isFollowing: vi.fn(),
  myDiwaniyas: vi.fn(),
  lastNightAt: vi.fn(),
  followerCount: vi.fn(),
  listRequests: vi.fn(),
  listAnnouncements: vi.fn(),
  myDiwaniyaList: vi.fn(),
  listTonight: vi.fn(),
  leagueDiwaniyas: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { ApiError, sheetTotals } = await import('./lib/api');
const { Score, leader } = await import('./screens/Score');
const { Guides } = await import('./screens/Guides');
const { Settings } = await import('./screens/Settings');
const { Place } = await import('./screens/Place');
const { Board } = await import('./screens/Board');
const { League } = await import('./screens/League');
const { Tonight } = await import('./screens/Tonight');
const { Splash, SPLASH_MS } = await import('./components/Logo');

const ME = '11111111-1111-4111-8111-111111111111';
const HOST = '33333333-3333-4333-8333-333333333333';
const DW = '22222222-2222-4222-8222-222222222222';
const NIGHT = '44444444-4444-4444-8444-444444444444';
const TB = '55555555-5555-4555-8555-555555555555';
const SHEET = '66666666-6666-4666-8666-666666666666';
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
    ping_areas: [],
    quiet_start: null,
    quiet_end: null,
    ping_daily_cap: 3,
  },
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
};

function withAll(ui: React.ReactNode, prefs: Partial<Prefs> = { lang: 'en' }) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={ready}>{ui}</SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const sheet = (extra: Partial<Record<string, unknown>> = {}) => ({
  id: SHEET,
  diwaniya_id: DW,
  table_id: TB,
  rule_pack: 'kout_bo4',
  teams: 2,
  players: [
    { seat: 1, user_id: ME, name: 'Ali', team: 1 },
    { seat: 2, user_id: HOST, name: 'Tariq', team: 2 },
    { seat: 3, user_id: null, name: 'Bader', team: 1 },
    { seat: 4, user_id: null, name: 'Fahad', team: 2 },
  ],
  started_by: ME,
  status: 'open',
  game_id: null,
  created_at: '2026-11-18T18:00:00Z',
  ...extra,
});
const round = (n: number, points: number[], undone = false) => ({ round_no: n, points, added_by: ME, created_at: '2026-11-18T18:10:00Z', undone_at: undone ? '2026-11-18T18:20:00Z' : null });

describe('(3) live scoring', () => {
  it('adds up the rounds still standing and finds the leader', () => {
    expect(sheetTotals(2, [round(1, [5, 0]), round(2, [0, 14], true), round(3, [7, 0])])).toEqual([12, 0]);
    expect(leader([12, 0])).toBe(1);
    expect(leader([5, 5])).toBe(0);
    expect(leader([-75, 200, -25, -100])).toBe(2);
  });
  it('reopens the open sheet after a refresh and shows the running totals', async () => {
    api.openSheet.mockResolvedValue(sheet());
    api.getSheet.mockResolvedValue({ sheet: sheet(), rounds: [round(1, [5, 0]), round(2, [0, 14], true), round(3, [7, 0])] });
    withAll(<Score id={DW} table={TB} />);
    const board = await screen.findByRole('group', { name: en.score.total });
    expect(within(board).getByText('12')).toBeTruthy();
    expect(within(board).getByText(en.score.leading)).toBeTruthy();
    expect(within(board).getByText('Ali، Bader')).toBeTruthy();
    expect(api.openSheet).toHaveBeenCalledWith(DW, TB, ME);
    // the undone round stays listed, marked, without its undo button
    expect(screen.getByText(en.score.roundUndone)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Undo round/ })).toHaveLength(2);
    // the next round is numbered after the live ones
    expect(screen.getByRole('heading', { name: new RegExp(`^${en.score.round(3, String)}`) })).toBeTruthy();
  });
  it('saves a round as it is added, Arabic digits included', async () => {
    api.openSheet.mockResolvedValue(sheet());
    api.getSheet.mockResolvedValue({ sheet: sheet(), rounds: [] });
    api.addRound.mockResolvedValue(1);
    withAll(<Score id={DW} table={TB} />);
    expect(await screen.findByText(en.score.noRounds)).toBeTruthy();
    const [a, b] = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(a, { target: { value: '٧' } });
    fireEvent.change(b, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: en.score.addRound }));
    await waitFor(() => expect(api.addRound).toHaveBeenCalledWith(SHEET, [7, 0]));
    // finish waits for a round
    expect((screen.getByRole('button', { name: en.score.finish }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('undoes one round by its number', async () => {
    api.openSheet.mockResolvedValue(sheet());
    api.getSheet.mockResolvedValue({ sheet: sheet(), rounds: [round(1, [5, 0]), round(2, [0, 12])] });
    api.undoRound.mockResolvedValue(undefined);
    withAll(<Score id={DW} table={TB} />);
    fireEvent.click(await screen.findByRole('button', { name: en.score.undoRound(2, String) }));
    await waitFor(() => expect(api.undoRound).toHaveBeenCalledWith(SHEET, 2));
  });
  it('finish sends the leader as the winner unless another is picked, then offers the next game', async () => {
    api.openSheet.mockResolvedValue(sheet());
    api.getSheet.mockResolvedValue({ sheet: sheet(), rounds: [round(1, [0, 12])] });
    api.finishScore.mockResolvedValue('g1');
    withAll(<Score id={DW} table={TB} />);
    const finish = await screen.findByRole('button', { name: en.score.finish });
    expect((screen.getAllByRole('radio')[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(finish);
    await waitFor(() => expect(api.finishScore).toHaveBeenCalledWith(SHEET, 2));
    expect(await screen.findByText(en.score.sent)).toBeTruthy();
    expect(screen.getByRole('button', { name: en.score.again })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.score.undo })).toBeTruthy();
  });
  it('a second phone at the table joins the open sheet instead of starting another', async () => {
    api.openSheet.mockResolvedValueOnce(null).mockResolvedValue(sheet());
    api.getSheet.mockResolvedValue({ sheet: sheet(), rounds: [] });
    api.scoreRoster.mockResolvedValue([{ id: ME, name: 'Ali', seat: 1 }]);
    api.getOpenNight.mockResolvedValue(null);
    api.startScore.mockRejectedValue(new ApiError('23505', 'a game is already being scored here'));
    withAll(<Score id={DW} />);
    await screen.findByRole('button', { name: en.score.start });
    for (const n of [2, 3, 4, 5, 6]) {
      fireEvent.change(screen.getByLabelText(`Player ${n}`), { target: { value: '__walk_in__' } });
      fireEvent.change(screen.getByLabelText(en.roster.walkInName(String(n))), { target: { value: `Guest ${n}` } });
    }
    fireEvent.click(screen.getByRole('button', { name: en.score.start }));
    expect(await screen.findByText(en.score.taken)).toBeTruthy();
  });
  it('the database keeps one open sheet per table and no direct writes', () => {
    expect(migration).toMatch(/create unique index score_sheets_one_open_table on public\.score_sheets \(table_id\) where status = 'open'/);
    expect(migration).toMatch(/revoke all on public\.score_sheets, public\.score_rounds from anon, authenticated;\ngrant select on public\.score_sheets, public\.score_rounds to authenticated;/);
    expect(migration).toMatch(/alter publication supabase_realtime add table public\.score_rounds/);
  });
});

describe('(4) game guides', () => {
  it('has How to score and Rules for all four games in both languages, the same shape in each', () => {
    expect(GUIDE_GAMES).toEqual(['kout', 'baloot', 'tarneeb', 'trix']);
    for (const g of GUIDE_GAMES) {
      for (const v of ['score', 'rules'] as const) {
        expect(GUIDES.en[g][v].length).toBeGreaterThan(1);
        expect(GUIDES.ar[g][v].length).toBe(GUIDES.en[g][v].length);
        GUIDES.ar[g][v].forEach((part, i) => expect(!!part.list).toBe(!!GUIDES.en[g][v][i].list));
      }
    }
    expect(gameOfPack('kout_bo6')).toBe('kout');
    expect(gameOfPack('tarneeb_41')).toBe('tarneeb');
  });
  it('Trix kingdoms add up to zero, as the guide says', () => {
    expect(-75 - 4 * 25 - 13 * 10 - 13 * 15 + 200 + 150 + 100 + 50).toBe(0);
  });
  it('opens on the asked game and view and switches without stacking history', () => {
    const before = window.history.length;
    withAll(<Guides game="baloot" view="score" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(`Baloot · ${en.guides.score}`);
    fireEvent.click(screen.getByRole('tab', { name: 'Trix' }));
    fireEvent.click(screen.getByRole('button', { name: en.guides.rules }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(`Trix · ${en.guides.rules}`);
    expect(window.location.hash).toBe('#/guides?game=trix&view=rules');
    expect(window.history.length).toBe(before);
    expect(parseHash('#/guides?game=trix&view=rules')).toEqual({ name: 'guides', game: 'trix', view: 'rules' });
    expect(parseHash('#/guides?game=poker')).toEqual({ name: 'guides', game: 'kout', view: 'score' });
  });
  it('is reachable from the score sheet and from League', async () => {
    api.openSheet.mockResolvedValue(sheet({ rule_pack: 'tarneeb_41' }));
    api.getSheet.mockResolvedValue({ sheet: sheet({ rule_pack: 'tarneeb_41' }), rounds: [] });
    withAll(<Score id={DW} table={TB} />);
    expect((await screen.findByRole('link', { name: en.score.howToScore })).getAttribute('href')).toBe('#/guides?game=tarneeb&view=score');
    cleanup();
    api.myDiwaniyaList.mockResolvedValue([]);
    withAll(<League />);
    expect(screen.getByRole('link', { name: new RegExp(en.guides.entry) }).getAttribute('href')).toBe('#/guides?game=kout&view=score');
  });
});

describe('(2) the address goes with the pin', () => {
  const dw = { id: DW, name: 'D', area: 'السالمية', usual_slot: '', host_id: ME, visibility: 'public', about: '', rules: '', approval: 'host', guest_cap: 4, pin_unlock_minutes: 60, host: { display_name: 'Ali' } };
  it('the host writes it in S9 Location and it is saved with the pin', async () => {
    api.getDiwaniya.mockResolvedValue(dw);
    api.getPin.mockResolvedValue({ lat: 29.3375, lng: 47.98, directions: 'Gate 2', address: '' });
    api.listRegulars.mockResolvedValue([]);
    api.listCohosts.mockResolvedValue([]);
    api.setPin.mockResolvedValue(undefined);
    api.updateDiwaniya.mockResolvedValue(undefined);
    withAll(<Settings id={DW} section="location" />);
    const box = (await screen.findByLabelText(new RegExp(`^${en.settings.address}`))) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(200);
    fireEvent.change(box, { target: { value: ' Khairan, Block 3\nHouse 7 ' } });
    fireEvent.click(screen.getByRole('button', { name: en.settings.saveLocation }));
    await waitFor(() => expect(api.setPin).toHaveBeenCalledWith(DW, 29.3375, 47.98, 'Gate 2', 'Khairan, Block 3 House 7'));
  });
  it('approved guests see the address with the map; the database reads it with the pin', async () => {
    api.getDiwaniya.mockResolvedValue({ ...dw, host_id: HOST });
    api.getOpenNight.mockResolvedValue({ id: NIGHT, starts_at: '2026-11-18T18:00:00Z', status: 'open', pin_unlock_at: '2026-11-18T17:00:00Z', diwaniya_id: DW, tables: [] });
    api.isFollowing.mockResolvedValue(false);
    api.getMyRequest.mockResolvedValue({ id: 'r', status: 'approved', table_id: null });
    api.getPin.mockResolvedValue({ lat: 29.3375, lng: 47.98, directions: '', address: 'Khairan, Block 3, House 7' });
    withAll(<Place id={DW} />);
    expect(await screen.findByText('Khairan, Block 3, House 7')).toBeTruthy();
    expect(migration).toMatch(/alter table public\.diwaniya_pins add column address text not null default ''\n {2}check \(char_length\(address\) <= 200 and address !~ '\[\[:cntrl:\]\]'\);/);
  });
});

describe('(5) launch', () => {
  it('plays the logo under 1.5 s, and a plain fade under reduced motion', async () => {
    expect(SPLASH_MS).toBeLessThanOrEqual(1500);
    const done = vi.fn();
    withAll(<Splash onDone={done} />);
    expect(screen.getByRole('img', { name: 'Diwaniyatna' })).toBeTruthy();
    await waitFor(() => expect(done).toHaveBeenCalled(), { timeout: 2000 });
    const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toMatch(/\.logo-mark--animated \.logo-mark__seat[^}]*animation: none/);
    // only transform and opacity move in the launch keyframes
    const frames = [...css.matchAll(/@keyframes (logo-[a-z-]+|splash-[a-z-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const f of frames) expect(f[2].replace(/(transform|opacity):[^;]+;/g, '').replace(/[\s{}%0-9,a-z]/g, '')).toBe('');
  });
});

describe('(6) the name is Diwaniyatna everywhere users see it', () => {
  it('title, manifest, icons label, service worker and copy', () => {
    expect(STRINGS.ar.appName).toBe('ديوانيتنا');
    expect(STRINGS.en.appName).toBe('Diwaniyatna');
    expect(JSON.parse(manifest).name).toBe('ديوانيتنا · Diwaniyatna');
    expect(JSON.parse(manifest).short_name).toBe('ديوانيتنا');
    expect(indexHtml).toMatch(/<title>ديوانيتنا<\/title>/);
    for (const text of [JSON.stringify(COPY), JSON.stringify(STRINGS), manifest, indexHtml, sw]) {
      expect(text).not.toMatch(/Diwaniya Tonight|ديوانية الليلة/);
    }
  });
});

describe('(1) one clear place for each action', () => {
  it('Board: no second Score in the header and no followed list (League has My diwaniyas)', async () => {
    api.myDiwaniyas.mockResolvedValue([{ id: DW, name: 'D', area: 'السالمية', host_id: ME }]);
    api.getOpenNight.mockResolvedValue({ id: NIGHT, starts_at: '2026-11-18T18:00:00Z', status: 'open', diwaniya_id: DW, tables: [{ id: TB, game: 'kout', seat_count: 4, label: '', queue_mode: 'rotation', need_one: false, seats: [], queue: [] }] });
    api.listRequests.mockResolvedValue([]);
    api.listAnnouncements.mockResolvedValue([]);
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    expect(screen.getAllByRole('link', { name: en.board.score })).toHaveLength(1); // the table's own
    expect(screen.queryByText(en.board.followed)).toBeNull();
  });
  it('League: My diwaniyas rows carry no Score and no extra Season button', async () => {
    api.myDiwaniyaList.mockResolvedValue([
      { id: DW, name: 'Diwaniya Al-Bahar', area: 'السالمية', visibility: 'public', why: ['tonight'], night_id: NIGHT, starts_at: '2026-11-18T18:00:00Z', open_seats: 2, need_one: false, my_status: 'arrived', my_request: 'r', my_table: TB, seated_table: TB },
    ]);
    withAll(<League />);
    await screen.findByText('Diwaniya Al-Bahar');
    expect(screen.queryByRole('link', { name: new RegExp(en.quick.score) })).toBeNull();
    expect(screen.queryByRole('button', { name: en.mine.toSeason })).toBeNull();
  });
  it('Tonight: Your night has no Open button next to the name that already opens it', async () => {
    api.listTonight.mockResolvedValue([]);
    api.myDiwaniyaList.mockResolvedValue([
      { id: DW, name: 'Diwaniya Al-Bahar', area: 'السالمية', visibility: 'public', why: ['tonight'], night_id: NIGHT, starts_at: '2026-11-18T18:00:00Z', open_seats: 2, need_one: false, my_status: 'pending', my_request: 'r', my_table: TB, seated_table: null },
    ]);
    withAll(<Tonight />);
    const name = await screen.findByRole('link', { name: /Diwaniya Al-Bahar/ });
    expect(name.getAttribute('href')).toBe(`#/d/${DW}`);
    expect(screen.queryByRole('link', { name: new RegExp(`^${en.quick.open} ·`) })).toBeNull();
  });
  it('the place keeps a list of what was removed', async () => {
    const notes = (await import('../.impeccable/duplicates-r2.md?raw')).default;
    for (const line of ['Your night', 'Board header', 'Diwaniyas you follow', 'My diwaniyas', 'jump row']) expect(notes).toContain(line);
  });
});
