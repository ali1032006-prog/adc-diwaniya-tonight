import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import apiSource from './lib/api.ts?raw';
import cssSource from './styles.css?raw';
import { PrefsContext, DEFAULT_PREFS, errorText, type Prefs } from './lib/prefs';
import { SessionContext, type SessionCtx } from './lib/session';
import { COPY } from './lib/copy';

// Review round 1/3 fixes (ADC-SEC-16..20, ADC-TSK-37): what the app shows for the new server rules.
// ./lib/api is spied so no backend is needed; the rules themselves are tested in supabase/tests/r2_fixes_test.sql.
const api = vi.hoisted(() => ({
  amIAdmin: vi.fn(),
  listBlocked: vi.fn(),
  listInbox: vi.fn(),
  markRead: vi.fn(),
  myCohostInvites: vi.fn(),
  acceptCohost: vi.fn(),
  declineCohost: vi.fn(),
}));
vi.mock('./lib/api', async (importActual) => {
  const real = await importActual<typeof import('./lib/api')>();
  return { ...real, ...api, subscribe: () => () => {} };
});

const { ApiError } = await import('./lib/api');
const { Inbox, inboxTarget } = await import('./screens/Inbox');
const { Me } = await import('./screens/Me');

const ME = '11111111-1111-4111-8111-111111111111';
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
});

describe('server refusals read as plain words', () => {
  it('names the review hold, the two-tries rule, the slow-down and a player who was not there', () => {
    expect(errorText(new ApiError('42501', 'your account is under review'), en)).toBe(en.errors.underReview);
    expect(errorText(new ApiError('54000', 'no more requests for this night'), en)).toBe(en.errors.nightTries);
    expect(errorText(new ApiError('54000', 'too many requests, wait a few minutes'), en)).toBe(en.errors.slowDown);
    expect(errorText(new ApiError('22023', 'a player was not at this diwaniya'), en)).toBe(en.errors.notThere);
    expect(errorText(new ApiError('42501', 'new row violates row-level security policy'), en)).toBe(en.errors.forbidden);
  });
});

describe('co-host invites (ADC-SEC-18)', () => {
  it('waits on Me until the invitee accepts', async () => {
    api.listBlocked.mockResolvedValue([]);
    api.amIAdmin.mockResolvedValue(false);
    api.myCohostInvites.mockResolvedValue([
      { diwaniya_id: DW, invited_at: '2026-11-17T18:00:00Z', diwaniya: { name: 'Diwaniya Al-Hamad', area: 'Rawda' } },
    ]);
    api.acceptCohost.mockResolvedValue(undefined);
    withAll(<Me />);
    expect(await screen.findByRole('heading', { name: en.me.invitesTitle })).toBeTruthy();
    expect(screen.getByText('Diwaniya Al-Hamad')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.me.accept }));
    await waitFor(() => expect(api.acceptCohost).toHaveBeenCalledWith(DW));
  });

  it('shows nothing on Me when there is no invite', async () => {
    api.listBlocked.mockResolvedValue([]);
    api.amIAdmin.mockResolvedValue(false);
    api.myCohostInvites.mockResolvedValue([]);
    withAll(<Me />);
    await waitFor(() => expect(api.myCohostInvites).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: en.me.invitesTitle })).toBeNull();
  });
});

describe('inbox: invites and hold alerts (ADC-SEC-18, ADC-SEC-20)', () => {
  it('sends an invite to Me and a hold alert to the admin queue', () => {
    expect(inboxTarget({ kind: 'cohost_invite', diwaniya_id: DW })).toBe('#/me');
    expect(inboxTarget({ kind: 'held', diwaniya_id: null })).toBe('#/admin');
  });

  it('names who is on hold, from the item body when it is a person', async () => {
    api.listInbox.mockResolvedValue([
      { id: 'i1', kind: 'held', body: 'Bader', diwaniya_id: null, night_id: null, request_id: null, table_id: null,
        created_at: new Date().toISOString(), read_at: null, diwaniya: null },
      { id: 'i2', kind: 'cohost_invite', body: '', diwaniya_id: DW, night_id: null, request_id: null, table_id: null,
        created_at: new Date().toISOString(), read_at: null, diwaniya: { name: 'Diwaniya Al-Hamad' } },
    ]);
    withAll(<Inbox />);
    expect(await screen.findByText(en.inbox.kinds.held('Bader'))).toBeTruthy();
    expect(screen.getByText(en.inbox.kinds.cohost_invite('Diwaniya Al-Hamad'))).toBeTruthy();
  });
});

describe('my data export (ADC-SEC-19)', () => {
  it('lists report columns instead of *, and never the reviewer or the note', () => {
    const src = apiSource;
    const block = src.slice(src.indexOf('export async function exportMyData'), src.indexOf('// ---', src.indexOf('export async function exportMyData')));
    expect(block).not.toMatch(/pick\('reports'/);
    const reports = block.slice(block.indexOf(".from('reports')"));
    const cols = /select\('([^']+)'\)/.exec(reports)?.[1] ?? '';
    expect(cols).toContain('status');
    expect(cols).not.toMatch(/reviewed_by|review_note|counts_to_hold|\*/);
  });
});

describe('welcome holds still while the font loads (ADC-TSK-37)', () => {
  it('reserves two lines for the title and the body', () => {
    const css = cssSource;
    const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    expect(rule('.welcome__title')).toMatch(/min-height:\s*calc\(2 \* 1\.3em\)/);
    expect(rule('.welcome__title')).toMatch(/line-height:\s*1\.3/);
    expect(rule('.welcome__title')).toMatch(/align-items:\s*flex-end/);
    expect(rule('.welcome__body')).toMatch(/min-height:\s*calc\(2 \* 1\.6em\)/);
  });
});
