import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import css from './styles.css?raw';
import renames from '../.impeccable/renames-r2.md?raw';
import migration from '../supabase/migrations/20261118132006_ali_change_list_3.sql?raw';
import { PrefsContext, DEFAULT_PREFS, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { UnreadContext } from './lib/unread';
import { COPY } from './lib/copy';
import { STRINGS } from './lib/i18n';

// Ali's change list 3 (ADC-LOG-781): (1) Inbox to a top menu, (2) Messages to hosts, (3) Score as the
// middle tab, (4) one-page Diwaniya tab with tap-to-edit, (5) plainer names, (6) red remove/cancel.
// The server rules are in supabase/tests/ali_changes3_test.sql; this file covers what the app shows.
const api = vi.hoisted(() => ({
  myThreads: vi.fn(),
  threadMessages: vi.fn(),
  threadWith: vi.fn(),
  startThread: vi.fn(),
  sendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  reportMessage: vi.fn(),
  scoreTargets: vi.fn(),
  openSheet: vi.fn(),
  getOpenNight: vi.fn(),
  scoreRoster: vi.fn(),
  getDiwaniya: vi.fn(),
  getPin: vi.fn(),
  getMyRequest: vi.fn(),
  isFollowing: vi.fn(),
  myDiwaniyas: vi.fn(),
  listRegulars: vi.fn(),
  listCohosts: vi.fn(),
  listRequests: vi.fn(),
  listAnnouncements: vi.fn(),
  lastNightAt: vi.fn(),
  followerCount: vi.fn(),
  updateDiwaniya: vi.fn(),
  removeRegular: vi.fn(),
  listInbox: vi.fn(),
  requestStatuses: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { NavBar } = await import('./components/NavBar');
const { TopMenu } = await import('./components/TopMenu');
const { Messages, Thread, Dm } = await import('./screens/Messages');
const { Score } = await import('./screens/Score');
const { Board } = await import('./screens/Board');
const { Place } = await import('./screens/Place');
const { Inbox } = await import('./screens/Inbox');
const { TABS, parseHash, href, tabOf } = await import('./lib/router');

const ME = '11111111-1111-4111-8111-111111111111';
const HOST = '33333333-3333-4333-8333-333333333333';
const DW = '22222222-2222-4222-8222-222222222222';
const NIGHT = '44444444-4444-4444-8444-444444444444';
const TB = '55555555-5555-4555-8555-555555555555';
const TH = '77777777-7777-4777-8777-777777777777';
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

function withAll(ui: React.ReactNode, session: SessionCtx = ready, unread = { inbox: 0, messages: 0 }, prefs: Partial<Prefs> = { lang: 'en' }) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}>
      <SessionContext.Provider value={session}>
        <UnreadContext.Provider value={unread}>{ui}</UnreadContext.Provider>
      </SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

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
const openNight = (seats: { seat_no: number; user_id: string | null; walk_in_name: string | null; profile?: { display_name: string } }[] = []) => ({
  id: NIGHT,
  starts_at: '2026-11-18T18:00:00Z',
  status: 'open' as const,
  diwaniya_id: DW,
  tables: [{ id: TB, game: 'kout' as const, seat_count: 4, label: 'A', queue_mode: 'rotation' as const, need_one: false, seats, queue: [] }],
});
const thread = (extra: Record<string, unknown> = {}) => ({
  id: TH,
  diwaniya_id: DW,
  diwaniya_name: 'Diwaniya Al-Bahar',
  last_at: '2026-11-18T12:00:00Z',
  role: 'guest',
  other_id: HOST,
  other_name: 'Bu Fahad',
  last_body: 'Yes, from nine',
  last_mine: false,
  unread: 1,
  blocked: false,
  open: true,
  ...extra,
});
function hostPage() {
  api.myDiwaniyas.mockResolvedValue([dw()]);
  api.getOpenNight.mockResolvedValue(openNight([{ seat_no: 1, user_id: null, walk_in_name: 'Walk-in' }]));
  api.getPin.mockResolvedValue({ lat: 29.3375, lng: 47.98, directions: 'Gate 2', address: 'Block 3' });
  api.listRegulars.mockResolvedValue([{ user_id: HOST, profile: { display_name: 'Bu Fahad' } }]);
  api.listCohosts.mockResolvedValue([]);
  api.listRequests.mockResolvedValue([
    { id: 'r1', night_id: NIGHT, table_id: null, status: 'pending', eta_minutes: 15, note: '', auto_approved: false, created_at: '2026-11-18T12:00:00Z', user: { id: HOST, display_name: 'Bu Fahad', area: 'السالمية' } },
  ]);
  api.listAnnouncements.mockResolvedValue([]);
  api.lastNightAt.mockResolvedValue(null);
  api.followerCount.mockResolvedValue(0);
  api.updateDiwaniya.mockResolvedValue(undefined);
}

// ------------------------------------------------------------------ (1) top menu
describe('(1) Inbox moved to a three-line menu at the top of every page', () => {
  it('the bottom nav has no Inbox; its five tabs are Tonight, Diwaniya, Score, League, Me', () => {
    expect([...TABS]).toEqual(['tonight', 'diwaniya', 'score', 'league', 'me']);
    withAll(<NavBar active="score" onReselect={() => {}} />);
    const links = screen.getAllByRole('link').map((l) => l.textContent);
    expect(links).toEqual(['Tonight', 'Diwaniya', 'Score', 'League', 'Me']);
    expect(screen.queryByRole('link', { name: /Inbox/ })).toBeNull();
  });
  it('the menu button carries the unread total and opens Inbox and Messages', async () => {
    withAll(<TopMenu />, ready, { inbox: 2, messages: 3 });
    const button = screen.getByRole('button', { name: `${en.topMenu.button}, 5 unread` });
    expect(button.querySelector('.top-menu__badge')?.textContent).toBe('5');
    fireEvent.click(button);
    await waitFor(() => expect(document.querySelector('dialog.sheet')).not.toBeNull());
    expect(screen.getByRole('button', { name: new RegExp(`^${en.topMenu.inbox}`), hidden: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(`^${en.topMenu.messages}`), hidden: true })).toBeTruthy();
  });
  it('is on every page: tab screens and pushed screens both carry it', async () => {
    api.listInbox.mockResolvedValue([]);
    api.requestStatuses.mockResolvedValue(new Map());
    withAll(<Inbox />);
    expect(screen.getByRole('button', { name: en.topMenu.button })).toBeTruthy();
    cleanup();
    api.scoreTargets.mockResolvedValue({ targets: [], reason: 'none' });
    withAll(<Score />);
    expect(screen.getByRole('button', { name: en.topMenu.button })).toBeTruthy();
  });
  it('is not shown signed out', () => {
    withAll(<TopMenu />, { ...ready, status: 'signedOut', userId: null, profile: null, priv: null });
    expect(screen.queryByRole('button', { name: new RegExp(en.topMenu.button) })).toBeNull();
  });
  it('routes Inbox and Messages as pages pushed over the current tab', () => {
    expect(parseHash('#/inbox')).toEqual({ name: 'inbox' });
    expect(parseHash('#/messages')).toEqual({ name: 'messages' });
    expect(parseHash(`#/messages/${TH}`)).toEqual({ name: 'thread', id: TH });
    expect(parseHash(`#/messages/d/${DW}`)).toEqual({ name: 'dm', id: DW });
    expect(parseHash('#/messages/<script>')).toEqual({ name: 'messages' });
    expect(tabOf({ name: 'inbox' }, 'league')).toBe('league');
    expect(tabOf({ name: 'thread', id: TH }, 'diwaniya')).toBe('diwaniya');
  });
});

// ------------------------------------------------------------------ (2) messages
describe('(2) Messages: people write to hosts, hosts answer', () => {
  it('lists conversations with who, the last words and what is new', async () => {
    api.myThreads.mockResolvedValue([thread(), thread({ id: 'x', role: 'host', other_name: 'Tariq', unread: 0, last_mine: true, last_body: 'See you' })]);
    withAll(<Messages />);
    const first = (await screen.findByText(en.messages.withHost('Diwaniya Al-Bahar'))).closest('a')!;
    expect(first.getAttribute('href')).toBe(href.thread(TH));
    expect(within(first).getByText(en.messages.unread(1, String))).toBeTruthy();
    expect(screen.getByText(en.messages.withGuest('Tariq', 'Diwaniya Al-Bahar'))).toBeTruthy();
    expect(screen.getByText(/^You:/)).toBeTruthy();
  });
  it('a conversation marks the other side read, sends, and reports a message', async () => {
    api.myThreads.mockResolvedValue([thread()]);
    api.threadMessages.mockResolvedValue([
      { id: 'm1', seq: 1, thread_id: TH, sender_id: ME, body: 'Is there kout tonight?', created_at: '2026-11-18T11:00:00Z', read_at: '2026-11-18T11:05:00Z' },
      { id: 'm2', seq: 2, thread_id: TH, sender_id: HOST, body: 'Yes, from nine', created_at: '2026-11-18T12:00:00Z', read_at: null },
    ]);
    api.markThreadRead.mockResolvedValue(undefined);
    api.sendMessage.mockResolvedValue('m3');
    api.reportMessage.mockResolvedValue(undefined);
    withAll(<Thread id={TH} />);
    expect(await screen.findByText('Yes, from nine')).toBeTruthy();
    await waitFor(() => expect(api.markThreadRead).toHaveBeenCalledWith(TH));
    // only the other side's words can be reported
    expect(screen.getAllByRole('button', { name: en.messages.report })).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(new RegExp(`^${en.messages.label}`)), { target: { value: '  Coming at ten  ' } });
    fireEvent.click(screen.getByRole('button', { name: en.messages.send }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(TH, 'Coming at ten'));
    fireEvent.click(screen.getByRole('button', { name: en.messages.report }));
    await waitFor(() => expect(document.querySelector('dialog.sheet')).not.toBeNull());
    fireEvent.click(within(document.querySelector('dialog.sheet') as HTMLElement).getByRole('button', { name: en.report.send, hidden: true }));
    await waitFor(() => expect(api.reportMessage).toHaveBeenCalledWith('m2', 'harassment', ''));
  });
  it('a block either way closes the box; messages off closes it for the guest only', async () => {
    api.threadMessages.mockResolvedValue([]);
    api.markThreadRead.mockResolvedValue(undefined);
    api.myThreads.mockResolvedValue([thread({ blocked: true })]);
    withAll(<Thread id={TH} />);
    expect(await screen.findByText(en.messages.blocked)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.messages.send })).toBeNull();
    cleanup();
    api.myThreads.mockResolvedValue([thread({ open: false })]);
    withAll(<Thread id={TH} />);
    expect(await screen.findByText(en.messages.hostOff)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.messages.send })).toBeNull();
    cleanup();
    api.myThreads.mockResolvedValue([thread({ role: 'host', open: true, other_name: 'Tariq' })]);
    withAll(<Thread id={TH} />);
    expect(await screen.findByRole('button', { name: en.messages.send })).toBeTruthy();
  });
  it('the first message to a host opens the conversation', async () => {
    api.getDiwaniya.mockResolvedValue(dw({ host_id: HOST }));
    api.threadWith.mockResolvedValue(null);
    api.startThread.mockResolvedValue(TH);
    withAll(<Dm id={DW} />);
    expect(await screen.findByText(en.messages.firstNote)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(new RegExp(`^${en.messages.label}`)), { target: { value: 'Salam' } });
    fireEvent.click(screen.getByRole('button', { name: en.messages.send }));
    await waitFor(() => expect(api.startThread).toHaveBeenCalledWith(DW, 'Salam'));
  });
  it('the diwaniya page offers Message host to guests while the host takes messages', async () => {
    api.getOpenNight.mockResolvedValue(null);
    api.isFollowing.mockResolvedValue(false);
    api.getDiwaniya.mockResolvedValue(dw({ host_id: HOST }));
    withAll(<Place id={DW} />);
    expect((await screen.findByRole('link', { name: en.messages.toHost })).getAttribute('href')).toBe(href.dm(DW));
    cleanup();
    api.getDiwaniya.mockResolvedValue(dw({ host_id: HOST, messages_on: false }));
    withAll(<Place id={DW} />);
    await screen.findByText('Diwaniya Al-Bahar');
    expect(screen.queryByRole('link', { name: en.messages.toHost })).toBeNull();
    cleanup();
    api.getDiwaniya.mockResolvedValue(dw());
    withAll(<Place id={DW} />);
    await screen.findByText('Diwaniya Al-Bahar');
    expect(screen.queryByRole('link', { name: en.messages.toHost })).toBeNull(); // his own diwaniya
  });
  it('the database keeps threads to the two people and writes behind checked functions', () => {
    expect(migration).toMatch(/create policy threads_read on public\.message_threads for select to authenticated\s+using \(auth\.uid\(\) = guest_id or auth\.uid\(\) = host_id\);/);
    expect(migration).toMatch(/revoke all on public\.message_threads, public\.messages from public, anon, authenticated;\ngrant select on public\.message_threads, public\.messages to authenticated;/);
    expect(migration).toMatch(/alter publication supabase_realtime add table public\.messages;/);
  });
});

// ------------------------------------------------------------------ (3) Score tab
describe('(3) Score is the middle tab and picks up the table he can score now', () => {
  it('opens the sheet for the first target straight away', async () => {
    api.scoreTargets.mockResolvedValue({
      targets: [{ diwaniya_id: DW, name: 'Diwaniya Al-Bahar', table_id: TB, game: 'kout', seat_count: 4, label: 'A', starts_at: '2026-11-18T18:00:00Z', why: 'seated' }],
      reason: null,
    });
    api.openSheet.mockResolvedValue(null);
    api.getOpenNight.mockResolvedValue(openNight());
    api.scoreRoster.mockResolvedValue([]);
    withAll(<Score />);
    expect(await screen.findByText(en.scoreTab.lead('Diwaniya Al-Bahar', 'A'))).toBeTruthy();
    expect(screen.getByText(en.scoreTab.why.seated)).toBeTruthy();
    await waitFor(() => expect(api.openSheet).toHaveBeenCalledWith(DW, TB, ME));
    expect(await screen.findByRole('button', { name: en.score.start })).toBeTruthy();
  });
  it('explains why not: approved but not sitting, waiting, or nothing', async () => {
    for (const [reason, title] of [['approved', en.scoreTab.approvedTitle], ['pending', en.scoreTab.pendingTitle], ['none', en.scoreTab.noneTitle]] as const) {
      api.scoreTargets.mockResolvedValue({ targets: [], reason });
      withAll(<Score />);
      expect(await screen.findByText(title)).toBeTruthy();
      expect(screen.getByRole('link', { name: en.scoreTab.toTonight }).getAttribute('href')).toBe('#/tonight');
      cleanup();
    }
  });
  it('is removed from every other place: the Diwaniya page and the diwaniya page carry no Score', async () => {
    hostPage();
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    expect(screen.queryByRole('link', { name: /^Score/ })).toBeNull();
    cleanup();
    api.getDiwaniya.mockResolvedValue(dw({ host_id: HOST }));
    api.getOpenNight.mockResolvedValue(openNight([{ seat_no: 1, user_id: ME, walk_in_name: null, profile: { display_name: 'Ali' } }]));
    api.isFollowing.mockResolvedValue(true);
    api.getMyRequest.mockResolvedValue({ id: 'r', status: 'arrived', table_id: TB });
    api.getPin.mockResolvedValue(null);
    withAll(<Place id={DW} />);
    await screen.findByText('Diwaniya Al-Bahar');
    expect(screen.queryByRole('link', { name: /^Score/ })).toBeNull();
    expect(href.score()).toBe('#/score');
    expect(parseHash('#/score')).toEqual({ name: 'score' });
  });
});

// ------------------------------------------------------------------ (4) one-page Diwaniya tab
describe('(4) the Diwaniya tab shows everything on one page, tap any item to edit it', () => {
  it('has all seven parts in order', async () => {
    hostPage();
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    const parts = [...document.querySelectorAll('.dw-part__title')].map((h) => h.textContent);
    expect(parts).toEqual([en.page.tonight, en.page.requests, en.page.tables, en.page.people, en.page.location, en.page.rules, en.page.settings]);
    // the facts show on the page itself, not behind a menu
    for (const v of ['Kout nights since 1990', 'No stakes', 'Block 3', 'Gate 2', 'Thursday 9pm', 'Bu Fahad']) expect(screen.getAllByText(v).length).toBeGreaterThan(0);
  });
  it('tapping a row edits it in place; Save saves that one field, red Cancel throws the change away', async () => {
    hostPage();
    withAll(<Board />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.rules)}`) }));
    const box = screen.getByLabelText(en.settings.rules) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Respect first' } });
    const cancel = screen.getByRole('button', { name: en.page.cancel });
    expect(cancel.className).toContain('btn--danger');
    fireEvent.click(cancel);
    expect(api.updateDiwaniya).not.toHaveBeenCalled();
    expect(screen.getAllByText('No stakes').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.rules)}`) }));
    fireEvent.change(screen.getByLabelText(en.settings.rules), { target: { value: 'Respect first' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(api.updateDiwaniya).toHaveBeenCalledWith(DW, { rules: 'Respect first' }));
  });
  it('the host turns messages off from the Settings part', async () => {
    hostPage();
    withAll(<Board />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${en.page.edit(en.messages.setting)}`) }));
    fireEvent.change(screen.getByLabelText(en.messages.setting), { target: { value: 'off' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));
    await waitFor(() => expect(api.updateDiwaniya).toHaveBeenCalledWith(DW, { messages_on: false }));
  });
  it('Esc cancels an edit and focus returns to the row (keyboard path)', async () => {
    hostPage();
    withAll(<Board />);
    const row = await screen.findByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.usualSlot)}`) });
    fireEvent.click(row);
    const box = screen.getByLabelText(new RegExp(`^${en.settings.usualSlot}`));
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(box, { key: 'Escape' });
    const back = await screen.findByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.usualSlot)}`) });
    await waitFor(() => expect(document.activeElement).toBe(back));
    expect(api.updateDiwaniya).not.toHaveBeenCalled();
  });
  it('a co-host sees the same facts without the pencil', async () => {
    hostPage();
    api.myDiwaniyas.mockResolvedValue([dw({ host_id: HOST })]);
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    expect(screen.queryByRole('button', { name: new RegExp(`^${en.page.edit(en.settings.rules)}`) })).toBeNull();
    expect(screen.getAllByText('No stakes').length).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ (5) plainer names
describe('(5) simpler names, Arabic and English, listed in .impeccable/', () => {
  it('Score a game is now just Score, everywhere', () => {
    expect(en.score.title).toBe('Score');
    expect(STRINGS.en.tabs.score).toBe('Score');
    expect(JSON.stringify(COPY.en) + JSON.stringify(STRINGS.en)).not.toMatch(/Score a game/);
    expect(JSON.stringify(COPY.ar) + JSON.stringify(STRINGS.ar)).not.toMatch(/سجّل لعبة'/);
  });
  it('the renames file lists the old and new labels', () => {
    for (const line of ['Score a game', 'Seat a walk-in guest', 'Add guest', 'Delete my account for good', 'أجلس ضيفاً حاضراً']) expect(renames).toContain(line);
  });
});

// ------------------------------------------------------------------ (6) red remove / cancel
function lum(hex: string): number {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('(6) every remove, cancel, discard, decline and delete is red, with an icon and words', () => {
  it('on the Diwaniya page (decline, remove from seat, remove table, remove regular, close night)', async () => {
    hostPage();
    withAll(<Board />);
    await screen.findByText(en.board.addTable);
    await screen.findByRole('button', { name: en.board.decline });
    const words = [en.board.decline, en.common.remove, en.board.removeTable, en.board.closeNight];
    const buttons = screen.getAllByRole('button').filter((b) => words.some((w) => b.textContent?.trim() === w));
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const b of buttons) {
      expect(b.className).toContain('btn--danger');
      expect(b.querySelector('svg')).not.toBeNull();
    }
  });
  it('the red reads at 4.5:1 or better on every surface in both themes', () => {
    const night = css.match(/:root \{[^}]*--danger: (#[0-9a-f]{6});/i)?.[1];
    const day = css.match(/:root\[data-theme='day'\] \{[^}]*--danger: (#[0-9a-f]{6});/i)?.[1];
    expect(night && day).toBeTruthy();
    for (const g of ['#15111a', '#1e1824', '#2a2231']) expect(ratio(night!, g)).toBeGreaterThanOrEqual(4.5);
    for (const g of ['#f6f1ea', '#fffaf4', '#efe6db']) expect(ratio(day!, g)).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.btn--danger \{[^}]*color: var\(--danger\)/);
  });
});
