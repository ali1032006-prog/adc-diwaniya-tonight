import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { UnreadContext } from './lib/unread';
import { COPY } from './lib/copy';
import type { Draw, NightCard, NightRow } from './lib/api';
import stateSrc from './tv/state.ts?raw';
import tvCss from './tv/tv.css?raw';
import tvHtml from '../tv.html?raw';
import legacySrc from '../public/tv-legacy.js?raw';
import pkgSrc from '../package.json?raw';
import viteSrc from '../vite.config.ts?raw';
import migrationSrc from '../supabase/migrations/20261118184831_tv_room.sql?raw';

// Diwaniya on the TV (ADC-RES-54, Ali's approval ADC-LOG-817: "don't add the QR code one").
const tv = vi.hoisted(() => ({ fetchTvState: vi.fn(), listenTv: vi.fn() }));
vi.mock('./tv/state', async (importActual) => {
  const real = await importActual<typeof import('./tv/state')>();
  return { ...real, fetchTvState: tv.fetchTvState, listenTv: tv.listenTv };
});
const api = vi.hoisted(() => ({
  tvCurrent: vi.fn(),
  tvOpen: vi.fn(),
  tvRevoke: vi.fn(),
  tvNewCode: vi.fn(),
  tvDraw: vi.fn(),
  nightCard: vi.fn(),
  listRequests: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { TvApp } = await import('./tv/TvApp');
const { normalizeCode, isCode, revealOrder, freshDraw, pollEvery, TvError } = await import('./tv/state');
const { TvPanel, drawCandidates } = await import('./components/TvRoom');
const { cardText, shareOrSave } = await import('./lib/nightCard');

if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  window.location.hash = '';
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const draw = (no: number, at = new Date().toISOString()): Draw => ({
  no,
  at,
  tables: [{ label: 'Table A', game: 'kout', seats: [
    { seat: 1, name: 'Ali', team: 1 },
    { seat: 2, name: 'Bader', team: 2 },
    { seat: 3, name: 'Fahad', team: 1 },
    { seat: 4, name: 'Hamad', team: 2 },
  ] }],
  waiting: ['Omar'],
});
const board = (over: Record<string, unknown> = {}) => ({
  status: 'live',
  topic: 'tv:0123456789abcdef0123456789abcdef',
  expires_at: '2026-11-19T03:00:00Z',
  diwaniya: { name: 'Diwaniya Bu Fahad', area: 'السالمية' },
  night: { starts_at: '2026-11-18T18:00:00Z' },
  tables: [{ label: 'A', game: 'kout', seat_count: 4, need_one: true, seats: [{ no: 1, name: 'Ali' }, { no: 2, name: 'Bader' }, { no: 3, name: 'Fahad' }] }],
  live: [{ table: 'A', rule_pack: 'kout_bo4', teams: 2, players: [{ name: 'Ali', team: 1 }, { name: 'Fahad', team: 1 }, { name: 'Bader', team: 2 }, { name: 'Hamad', team: 2 }], totals: [31, 17], rounds: 5, h2h: { a: 'Ali', b: 'Bader', games: 7, a_wins: 4, b_wins: 3 } }],
  season: [{ name: 'Ali', played: 12, wins: 9 }, { name: 'Bader', played: 10, wins: 5 }],
  crown: ['Ali'],
  draw: null,
  tonight: { games: 2, last: [{ rule_pack: 'kout_bo4', at: '2026-11-18T19:00:00Z', winners: ['Ali', 'Fahad'] }] },
  ...over,
});

describe('TV room code', () => {
  it('cleans what the TV types and accepts only the safe 6-letter alphabet', () => {
    expect(normalizeCode(' k7p-w3x ')).toBe('K7PW3X');
    expect(isCode('K7PW3X')).toBe(true);
    expect(isCode('K7PW30')).toBe(false); // no 0/O/1/I/B/8 lookalikes
    expect(isCode('K7PW3')).toBe(false);
  });
  it('polls fast while the broadcast is down and slowly while it is up', () => {
    expect(pollEvery(false)).toBe(5_000);
    expect(pollEvery(true)).toBe(30_000);
  });
  it('reveals the draw table by table, then the waiting list, and only takes over for a fresh draw', () => {
    const d = draw(2);
    expect(revealOrder(d).map((x) => x.name)).toEqual(['Ali', 'Bader', 'Fahad', 'Hamad', 'Omar']);
    expect(freshDraw(d, 1)).toBe(true);
    expect(freshDraw(d, 2)).toBe(false);
    expect(freshDraw(draw(3, new Date(Date.now() - 11 * 60_000).toISOString()), 2)).toBe(false);
  });
});

describe('the TV page never signs in', () => {
  it('uses its own client with no session, no refresh and no sign-in link reading', () => {
    expect(stateSrc).toMatch(/persistSession: false/);
    expect(stateSrc).toMatch(/autoRefreshToken: false/);
    expect(stateSrc).toMatch(/detectSessionInUrl: false/);
    expect(stateSrc).not.toMatch(/signIn|auth\.getSession|lib\/supabase/);
    expect(stateSrc).toMatch(/rpc\('tv_state'/);
  });
  it('is its own page with the old-browser fallback, and the build knows both pages', () => {
    expect(tvHtml).toMatch(/<script src="\/tv-legacy\.js"><\/script>/);
    expect(tvHtml).toMatch(/src\/tv\/main\.tsx/);
    expect(viteSrc).toMatch(/tv: fileURLToPath\(new URL\('\.\/tv\.html'/);
    // the fallback writes text, never HTML
    expect(legacySrc).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect(legacySrc).toMatch(/__dtTvReady/);
  });
  it('honours reduced motion', () => {
    expect(tvCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  });
});

describe('no QR code anywhere (ADC-LOG-817)', () => {
  it('has no QR library and no QR in the TV, the host screens or the database', () => {
    const pkg = JSON.parse(pkgSrc) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((k) => /qr/i.test(k))).toEqual([]);
    const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const hits = Object.entries(sources).filter(([, s]) => /\bqr\b|qrcode|qr-code/i.test(s)).map(([f]) => f);
    expect(hits).toEqual([]);
    expect(/qr/i.test(migrationSrc.replace(/QR code/g, ''))).toBe(false);
    expect(/qr/i.test(tvHtml + legacySrc)).toBe(false);
  });
});

describe('TV board', () => {
  it('shows the live score in big numbers, the rivalry, the season and the crown, with names only', async () => {
    localStorage.setItem('dt.tv.lang', 'en');
    localStorage.setItem('dt.tv.code', 'K7PW3X');
    tv.fetchTvState.mockResolvedValue(board());
    tv.listenTv.mockReturnValue(() => {});
    const { container } = render(<TvApp />);
    expect(await screen.findByRole('heading', { name: 'Diwaniya Bu Fahad' })).toBeTruthy();
    expect(tv.fetchTvState).toHaveBeenCalledWith('K7PW3X');
    expect(screen.getByText('31').className).toMatch(/tv-score/);
    expect(screen.getByText('17').className).toMatch(/tv-score/);
    expect(screen.getByText('4 – 3')).toBeTruthy();
    expect(screen.getByText('Head to head this season')).toBeTruthy();
    const season = screen.getByRole('table');
    expect(within(season).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('One short')).toBeTruthy();
    expect(screen.getByText('Open seat')).toBeTruthy();
    expect(screen.getByText("This month's crown")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(UUID);
    // it listens on the room's topic
    expect(tv.listenTv).toHaveBeenCalledWith('tv:0123456789abcdef0123456789abcdef', expect.any(Function), expect.any(Function));
  });

  it('a ping reads the state again', async () => {
    localStorage.setItem('dt.tv.code', 'K7PW3X');
    tv.fetchTvState.mockResolvedValue(board());
    let ping: (ended: boolean) => void = () => {};
    tv.listenTv.mockImplementation((_t: string, onPing: (e: boolean) => void) => ((ping = onPing), () => {}));
    render(<TvApp />);
    await screen.findByText('31');
    const before = tv.fetchTvState.mock.calls.length;
    tv.fetchTvState.mockResolvedValue(board({ live: [{ ...board().live[0], totals: [41, 17], rounds: 6 }] }));
    act(() => ping(false));
    expect(await screen.findByText('41', {}, { timeout: 2000 })).toBeTruthy();
    expect(tv.fetchTvState.mock.calls.length).toBeGreaterThan(before);
  });

  it('a revoked or expired code goes back to the code screen and forgets the code', async () => {
    localStorage.setItem('dt.tv.lang', 'en');
    localStorage.setItem('dt.tv.code', 'K7PW3X');
    tv.fetchTvState.mockResolvedValue({ status: 'ended' });
    render(<TvApp />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/This screen has ended/));
    expect(localStorage.getItem('dt.tv.code')).toBeNull();
  });

  it('the code screen cleans the typed code and says when there were too many tries', async () => {
    localStorage.setItem('dt.tv.lang', 'en');
    tv.fetchTvState.mockRejectedValue(new TvError('limit', 'too many'));
    render(<TvApp />);
    const box = screen.getByLabelText('Room code (6 letters)') as HTMLInputElement;
    const show = screen.getByRole('button', { name: 'Show' }) as HTMLButtonElement;
    expect(show.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'k7p w3x' } });
    expect(box.value).toBe('K7PW3X');
    fireEvent.click(show);
    await waitFor(() => expect(tv.fetchTvState).toHaveBeenCalledWith('K7PW3X'));
    expect(await screen.findByText(/Too many tries/)).toBeTruthy();
  });

  it('a fresh draw takes over the screen with every name, and a key closes it', async () => {
    localStorage.setItem('dt.tv.lang', 'en');
    localStorage.setItem('dt.tv.code', 'K7PW3X');
    tv.fetchTvState.mockResolvedValue(board({ draw: draw(3) }));
    tv.listenTv.mockReturnValue(() => {});
    render(<TvApp />);
    const dialog = await screen.findByRole('dialog', { name: "Tonight's draw" });
    for (const n of ['Ali', 'Bader', 'Fahad', 'Hamad', 'Omar']) expect(within(dialog).getByText(n)).toBeTruthy();
    expect(within(dialog).getByText('Waiting their turn')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('speaks Arabic, right to left, by default', async () => {
    localStorage.setItem('dt.tv.code', 'K7PW3X');
    tv.fetchTvState.mockResolvedValue(board());
    tv.listenTv.mockReturnValue(() => {});
    render(<TvApp />);
    await screen.findByText('جدول الموسم');
    expect(document.documentElement.dir).toBe('rtl');
  });
});

// ---------------------------------------------------------------- the host's phone
const ME = '11111111-1111-4111-8111-111111111111';
const session: SessionCtx = {
  status: 'ready',
  userId: ME,
  email: 'me@example.invalid',
  provider: 'email',
  profile: { id: ME, display_name: 'Ali', area: 'السالمية', games: ['kout'], created_at: '2026-11-01T10:00:00Z' },
  priv: null,
  refresh: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
};
function withAll(ui: React.ReactNode) {
  return render(
    <PrefsContext.Provider value={{ prefs: { ...DEFAULT_PREFS, lang: 'en' }, setPrefs: () => {} }}>
      <SessionContext.Provider value={session}>
        <UnreadContext.Provider value={{ inbox: 0, messages: 0 }}>{ui}</UnreadContext.Provider>
      </SessionContext.Provider>
    </PrefsContext.Provider>,
  );
}
const night: NightRow = {
  id: 'n1',
  starts_at: '2026-11-18T18:00:00Z',
  status: 'open',
  tables: [
    { id: 't1', game: 'kout', seat_count: 4, label: 'A', queue_mode: 'rotation', need_one: false, seats: [
      { seat_no: 2, user_id: 'u2', walk_in_name: null, profile: { display_name: 'Bader' } },
      { seat_no: 1, user_id: null, walk_in_name: 'Abu Fahad', profile: null },
    ] },
  ],
};
const en = COPY.en;

describe('host: Show on TV, Tonight\'s draw, Night card', () => {
  it('lists seated people and the arrived for the draw, once each', () => {
    const names = drawCandidates(night, [
      { id: 'r1', night_id: 'n1', table_id: null, status: 'arrived', eta_minutes: 0, note: '', auto_approved: false, created_at: '', user: { id: 'u2', display_name: 'bader', area: '' } },
      { id: 'r2', night_id: 'n1', table_id: null, status: 'arrived', eta_minutes: 0, note: '', auto_approved: false, created_at: '', user: { id: 'u3', display_name: 'Hamad', area: '' } },
      { id: 'r3', night_id: 'n1', table_id: null, status: 'pending', eta_minutes: 0, note: '', auto_approved: false, created_at: '', user: { id: 'u4', display_name: 'Pending', area: '' } },
    ]);
    expect(names).toEqual(['Abu Fahad', 'Bader', 'Hamad']);
  });

  it('opens a room, shows the code and the link, and stops it', async () => {
    api.tvCurrent.mockResolvedValue(null);
    api.tvOpen.mockResolvedValue({ code: 'K7PW3X', expires_at: '2026-11-19T03:00:00Z' });
    api.tvRevoke.mockResolvedValue(1);
    withAll(<TvPanel night={night} diwaniyaId="d1" />);
    fireEvent.click(screen.getByRole('button', { name: en.tvroom.show }));
    fireEvent.click(await screen.findByRole('button', { name: en.tvroom.open }));
    expect(await screen.findByText('K7PW3X')).toBeTruthy();
    expect(api.tvOpen).toHaveBeenCalledWith('n1');
    expect(screen.getByText(/\/tv$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.tvroom.stop }));
    expect(await screen.findByText(en.tvroom.stopped)).toBeTruthy();
    expect(api.tvRevoke).toHaveBeenCalledWith('n1');
    expect(screen.queryByText('K7PW3X')).toBeNull();
  });

  it('draws with the picked names (one unticked), and shows where each one sits', async () => {
    api.tvCurrent.mockResolvedValue({ code: 'K7PW3X', expires_at: '2026-11-19T03:00:00Z' });
    api.listRequests.mockResolvedValue([]);
    api.tvDraw.mockResolvedValue(draw(1));
    withAll(<TvPanel night={night} diwaniyaId="d1" />);
    fireEvent.click(screen.getByRole('button', { name: en.tvroom.draw }));
    const dialog = await screen.findByRole('dialog', { name: en.tvroom.draw });
    fireEvent.change(within(dialog).getByLabelText(en.tvroom.drawAdd), { target: { value: 'Omar' } });
    fireEvent.click(within(dialog).getByRole('button', { name: en.tvroom.drawAddBtn }));
    fireEvent.change(within(dialog).getByLabelText(en.tvroom.drawAdd), { target: { value: 'Khaled' } });
    fireEvent.click(within(dialog).getByRole('button', { name: en.tvroom.drawAddBtn }));
    fireEvent.click(within(dialog).getByLabelText('Bader'));
    fireEvent.click(within(dialog).getByRole('button', { name: en.tvroom.drawGo }));
    await waitFor(() => expect(api.tvDraw).toHaveBeenCalledWith('n1', ['Abu Fahad', 'Omar', 'Khaled']));
    expect(await within(dialog).findByText('Draw no. 1 tonight')).toBeTruthy();
    expect(within(dialog).getByText('Hamad')).toBeTruthy();
    expect(within(dialog).getByText(en.tvroom.waiting)).toBeTruthy();
  });

  it('will not draw fewer than two names', async () => {
    api.tvCurrent.mockResolvedValue(null);
    api.listRequests.mockResolvedValue([]);
    withAll(<TvPanel night={{ ...night, tables: [] }} diwaniyaId="d1" />);
    fireEvent.click(screen.getByRole('button', { name: en.tvroom.draw }));
    const dialog = await screen.findByRole('dialog', { name: en.tvroom.draw });
    expect((within(dialog).getByRole('button', { name: en.tvroom.drawGo }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText(en.tvroom.drawNoPeople)).toBeTruthy();
  });
});

describe('Night card', () => {
  const card: NightCard = {
    name: 'Diwaniya Bu Fahad',
    area: 'السالمية',
    starts_at: '2026-11-18T18:00:00Z',
    open: false,
    games: 3,
    players: 6,
    list: [{ rule_pack: 'kout_bo4', at: '2026-11-18T19:00:00Z', winners: ['Ali', 'Fahad'], losers: ['Bader', 'Hamad'] }],
    top: [{ name: 'Ali', wins: 3, played: 3 }],
    me: { played: 3, wins: 2 },
    crown: ['Ali'],
    host: true,
  };
  it('says the night in the reader\'s language', () => {
    const t = cardText(card, en, (n) => String(n), 'en', 'Salmiya', en.score.packs);
    expect(t.rtl).toBe(false);
    expect(t.games).toBe('3 games');
    expect(t.players).toBe('6 players');
    expect(t.top).toBe('Ali');
    expect(t.topWins).toBe('3 wins');
    expect(t.results[0]).toEqual({ pack: 'Kout (4 players)', line: 'Ali, Fahad beat Bader, Hamad' });
    expect(t.me).toBe('You: 2 of 3');
    const ar = cardText(card, COPY.ar, (n) => String(n), 'ar', 'السالمية', COPY.ar.score.packs);
    expect(ar.rtl).toBe(true);
    expect(ar.brand).toBe('ديوانيتنا');
    expect(JSON.stringify(ar)).not.toMatch(UUID);
  });
  it('uses the phone\'s share sheet when it takes pictures, and saves the picture when it does not', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const share = vi.fn(async () => {});
    expect(await shareOrSave(blob, 'night-card', 'x', { share, canShare: () => true } as unknown as Navigator)).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.any(File)] }));
    const cancel = vi.fn(async () => {
      throw new DOMException('no', 'AbortError');
    });
    expect(await shareOrSave(blob, 'night-card', 'x', { share: cancel, canShare: () => true } as unknown as Navigator)).toBe('cancelled');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await shareOrSave(blob, 'night-card', 'x', {} as Navigator)).toBe('saved');
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
