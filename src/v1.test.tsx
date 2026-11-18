import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrefsContext, DEFAULT_PREFS, errorText, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { parseHash, tabOf } from './lib/router';
import { COPY, arCount } from './lib/copy';

// v1 completion: S4 pings guide helpers, the moderation queue, announcements in the Inbox,
// partner/rival stats and delete my account. ./lib/api is spied so no backend is needed.
const api = vi.hoisted(() => ({
  amIAdmin: vi.fn(),
  adminReports: vi.fn(),
  adminReview: vi.fn(),
  adminHidden: vi.fn(),
  adminSummary: vi.fn(),
  adminUnhide: vi.fn(),
  listInbox: vi.fn(),
  markRead: vi.fn(),
  listBlocked: vi.fn(),
  deleteMyAccount: vi.fn(),
  getPlayer: vi.fn(),
  myDiwaniyas: vi.fn(),
  playerRelations: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { ApiError } = await import('./lib/api');
const { urlBase64ToBytes, bytesToUrlBase64, isIOS } = await import('./lib/push');
const { Admin } = await import('./screens/Admin');
const { Inbox } = await import('./screens/Inbox');
const { Me } = await import('./screens/Me');
const { Player } = await import('./screens/Player');

const ME = '11111111-1111-4111-8111-111111111111';
const HIM = '55555555-5555-4555-8555-555555555555';
const DW = '22222222-2222-4222-8222-222222222222';
const en = COPY.en;

const ready: SessionCtx = {
  status: 'ready',
  userId: ME,
  email: 'me@example.invalid',
  provider: 'google',
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
});

describe('push helpers (S4)', () => {
  it('turns a VAPID key into bytes and back', () => {
    const key = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
    const bytes = urlBase64ToBytes(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
    expect(bytesToUrlBase64(bytes.buffer)).toBe(key);
    expect(bytesToUrlBase64(null)).toBe('');
  });
  it('spots iPhone, iPad (also when it calls itself a Mac) and not a desktop Mac', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIOS('Mozilla/5.0 (Linux; Android 15)', 5)).toBe(false);
  });
});

describe('Arabic counts', () => {
  const f = { one: 'لعبة واحدة', two: 'لعبتان', few: 'ألعاب', many: 'لعبة' };
  it('uses the one, two, 3-10 plural and 11+ singular forms', () => {
    expect(arCount(1, String, f)).toBe('لعبة واحدة');
    expect(arCount(2, String, f)).toBe('لعبتان');
    expect(arCount(3, String, f)).toBe('3 ألعاب');
    expect(arCount(10, String, f)).toBe('10 ألعاب');
    expect(arCount(11, String, f)).toBe('11 لعبة');
    expect(arCount(103, String, f)).toBe('103 ألعاب');
    expect(COPY.ar.nudge.followers(3, String)).toContain('متابعين');
  });
});

describe('routes', () => {
  it('parses the pings guide and the admin queue and keeps the Me pill on them', () => {
    expect(parseHash('#/pings')).toEqual({ name: 'pings' });
    expect(parseHash('#/admin')).toEqual({ name: 'admin' });
    expect(tabOf({ name: 'pings' }, 'tonight')).toBe('me');
    expect(tabOf({ name: 'admin' }, 'league')).toBe('me');
  });
  it('maps the rate limit (54000) to its own message', () => {
    expect(errorText(new ApiError('54000', 'too many'), en)).toBe(en.errors.limit);
  });
});

describe('Admin (ruling D)', () => {
  it('turns non-admins away', async () => {
    api.amIAdmin.mockResolvedValue(false);
    withAll(<Admin />);
    expect(await screen.findByText(en.admin.notAdmin)).toBeTruthy();
    expect(api.adminReports).not.toHaveBeenCalled();
  });

  it('lists open reports and hides a diwaniya after the confirm', async () => {
    api.amIAdmin.mockResolvedValue(true);
    api.adminReports.mockResolvedValue([
      {
        id: 'r1',
        reason: 'safety',
        details: 'Loud and rude',
        status: 'open',
        created_at: '2026-11-17T18:00:00Z',
        reviewed_at: null,
        review_note: '',
        target_label: 'Diwaniya Al-Bahar',
        reporter: { id: ME, name: 'Faisal' },
        target_user: null,
        target_diwaniya: { id: DW, name: 'Diwaniya Al-Bahar', area: 'Salmiya', hidden_at: null, held_at: '2026-11-17T18:05:00Z', open_reports: 3 },
      },
    ]);
    api.adminReview.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    withAll(<Admin />);
    expect(await screen.findByText('Loud and rude')).toBeTruthy();
    expect(screen.getByText(en.admin.held)).toBeTruthy();
    expect(screen.getByText(en.admin.openCount(3, String))).toBeTruthy();
    fireEvent.change(screen.getByLabelText(en.admin.note), { target: { value: 'checked' } });
    fireEvent.click(screen.getByRole('button', { name: en.admin.hideDiwaniya }));
    await waitFor(() => expect(api.adminReview).toHaveBeenCalledWith('r1', 'hide_diwaniya', 'checked'));
    expect(confirm).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: en.admin.hideUser })).toBeNull();
    confirm.mockRestore();
  });

  it('shows the summary numbers', async () => {
    api.amIAdmin.mockResolvedValue(true);
    api.adminReports.mockResolvedValue([]);
    api.adminSummary.mockResolvedValue({
      open: 4, open_by_reason: { fake: 3, safety: 1 }, new_7d: 6, reviewed_7d: 2,
      held_users: 1, held_diwaniyas: 0, hidden_users: 0, hidden_diwaniyas: 1, no_shows_7d: 5,
    });
    withAll(<Admin />);
    fireEvent.click(await screen.findByRole('tab', { name: en.admin.tabs.summary }));
    expect(await screen.findByText(en.admin.sum.byReason)).toBeTruthy();
    expect(screen.getByText(en.report.reasons.fake)).toBeTruthy();
  });
});

describe('Inbox announcements', () => {
  it("shows the host's note under the item", async () => {
    api.listInbox.mockResolvedValue([
      {
        id: 'i1', kind: 'announcement', body: 'Use the side door', diwaniya_id: DW, night_id: null, request_id: null,
        table_id: null, created_at: new Date().toISOString(), read_at: null, diwaniya: { name: 'Diwaniya Al-Bahar' },
      },
    ]);
    withAll(<Inbox />);
    expect(await screen.findByText('Use the side door')).toBeTruthy();
    expect(screen.getByText(en.inbox.kinds.announcement('Diwaniya Al-Bahar'))).toBeTruthy();
  });
});

describe('Me: delete my account', () => {
  it('stays locked until the confirm word is typed, then deletes and signs out', async () => {
    api.listBlocked.mockResolvedValue([]);
    api.amIAdmin.mockResolvedValue(false);
    api.deleteMyAccount.mockResolvedValue(undefined);
    withAll(<Me section="delete" />);
    const button = (await screen.findByRole('button', { name: en.me.deleteButton })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const input = screen.getByLabelText(en.me.deleteType(en.me.deleteWord));
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: en.me.deleteWord } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(api.deleteMyAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(ready.signOut).toHaveBeenCalled());
    expect(screen.queryByText(en.admin.entry)).toBeNull();
  });

  it('shows the admin entry only to the admin', async () => {
    api.listBlocked.mockResolvedValue([]);
    api.amIAdmin.mockResolvedValue(true);
    withAll(<Me />);
    expect(await screen.findByText(en.admin.entry)).toBeTruthy();
  });
});

describe('Player: partners and rivals', () => {
  it('shows what we played together and who he plays with', async () => {
    api.getPlayer.mockResolvedValue({
      profile: { id: HIM, display_name: 'Saad', area: 'Rawda', games: ['kout'], created_at: '2026-10-01T10:00:00Z' },
      stats: { nights_shown: 3, no_shows: 0, games: 5, wins: 3 },
    });
    api.myDiwaniyas.mockResolvedValue([]);
    api.playerRelations.mockResolvedValue({
      with_me: { partner_games: 2, partner_wins: 1, rival_games: 3, his_wins: 2, my_wins: 1 },
      played_with: [{ id: ME, name: 'Faisal', games: 5, wins_together: 1 }],
    });
    withAll(<Player id={HIM} />);
    expect(await screen.findByText(en.relations.partner(2, 1, String))).toBeTruthy();
    expect(screen.getByText(en.relations.rival(3, 2, 1, String))).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Faisal' }).getAttribute('href')).toBe(`#/player/${ME}`);
  });
});
