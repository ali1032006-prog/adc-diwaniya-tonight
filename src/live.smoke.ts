// Live smoke of src/lib/api.ts against the dev Supabase project (not part of `npm test`).
// Run through scripts/live_smoke.py, which creates two throwaway accounts, passes their
// credentials in the environment, and deletes them afterwards.
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

declare const process: { env: Record<string, string | undefined> };

const URL = process.env.VITE_SUPABASE_URL!;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const PASS = process.env.SMOKE_PASSWORD!;
const HOST = process.env.SMOKE_HOST_EMAIL!;
const GUEST = process.env.SMOKE_GUEST_EMAIL!;

// api.ts reads one shared client; each actor gets its own module instance with its own session.
async function actor(email: string) {
  const { vi } = await import('vitest');
  vi.resetModules();
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  vi.doMock('./lib/supabase', () => ({ supabase: () => client, setSupabaseForTests: () => {} }));
  const api = await import('./lib/api');
  vi.doUnmock('./lib/supabase');
  const { data } = await client.auth.getUser();
  return { api, id: data.user!.id };
}

describe.skipIf(!PASS)('api.ts against dev (host + guest)', () => {
  it('runs the core loop end to end', async () => {
    const H = await actor(HOST);
    const G = await actor(GUEST);
    expect(H.id).not.toBe(G.id);

    // S3 profiles
    await H.api.completeProfile('Smoke Host', 'السالمية', '1985-05-05', true);
    await G.api.completeProfile('Smoke Guest', 'Jabriya', '1995-05-05', true);
    expect((await G.api.getMe()).profile?.display_name).toBe('Smoke Guest');

    // S8/S9 host opens a diwaniya and a night that started 10 minutes ago
    const { id: dw } = await H.api.createDiwaniya('Smoke Diwaniya', 'السالمية');
    await H.api.updateDiwaniya(dw, { rules: 'No stakes', guest_cap: 4, pin_unlock_minutes: 60, usual_slot: 'Thu 9pm' });
    await H.api.setPin(dw, 29.33, 48.08, 'Blue door');
    expect((await H.api.myDiwaniyas()).map((d) => d.id)).toContain(dw);
    const { id: night } = await H.api.openNight(dw, new Date(Date.now() - 10 * 60_000));
    await H.api.addTable(night, 'kout', 6, 'A');
    const hn = await H.api.getOpenNight(dw);
    expect(hn?.tables).toHaveLength(1);
    const table = hn!.tables[0].id;

    // S5/S6 guest finds it, follows, cannot see the pin yet, requests a seat
    const tonight = await G.api.listTonight();
    expect(tonight.some((n) => n.diwaniya?.id === dw)).toBe(true);
    const page = await G.api.getDiwaniya(dw);
    expect(page?.host?.display_name).toBe('Smoke Host');
    await G.api.setFollow(dw, true);
    expect(await G.api.isFollowing(dw)).toBe(true);
    expect((await G.api.listFollowed()).map((d) => d.id)).toContain(dw);
    expect(await G.api.getPin(dw)).toBeNull();
    const req = await G.api.requestSeat(night, table, 15, 'Kout please', true);
    expect((await G.api.getMyRequest(night))?.status).toBe('pending');

    // S8 host sees and approves it; inbox and badge count
    const reqs = await H.api.listRequests(night);
    expect(reqs[0].user?.display_name).toBe('Smoke Guest');
    expect(await H.api.unreadCount()).toBeGreaterThan(0);
    expect((await H.api.listInbox())[0].diwaniya?.name).toBe('Smoke Diwaniya');
    expect(await H.api.decideRequest(req, true)).toBe('approved');

    // S6 guest: pin unlocked, takes seat 2; the ring shows the name
    expect((await G.api.getPin(dw))?.directions).toBe('Blue door');
    expect((await G.api.listInbox()).some((i) => i.kind === 'approved')).toBe(true);
    await G.api.checkIn(table, 2);
    const gn = await G.api.getOpenNight(dw);
    expect(gn?.tables[0].seats.find((s) => s.seat_no === 2)?.profile?.display_name).toBe('Smoke Guest');

    // S8 need one, walk-in, regulars, queue mode
    expect(typeof (await H.api.setNeedOne(table, true))).toBe('number');
    await H.api.seatWalkIn(table, 3, 'Uncle Walk-in');
    await H.api.setQueueMode(table, 'winner_stays');
    await H.api.addRegular(dw, G.id);
    expect((await H.api.listRegulars(dw))[0].profile?.display_name).toBe('Smoke Guest');
    expect((await H.api.listCohosts(dw))).toEqual([]);

    // S10/S11 score, league, crown, undo
    const results = [1, 2, 3, 4].map((seat) => ({
      seat,
      user_id: seat === 1 ? H.id : seat === 2 ? G.id : null,
      name: `P${seat}`,
      team: seat % 2 === 1 ? 1 : 2,
      points: seat % 2 === 1 ? 152 : 90,
      won: seat % 2 === 1,
    }));
    const game = await G.api.recordGame(dw, 'kout_bo4', table, results);
    const table1 = await G.api.standings(dw);
    expect(table1.find((r) => r.user_id === H.id)?.wins).toBe(1);
    const games = await H.api.recentGames(dw);
    expect(games[0].results).toHaveLength(4);
    expect(H.api.monthlyCrown(games)).toContain('Smoke Host');
    expect((await G.api.leagueDiwaniyas()).map((d) => d.id)).toContain(dw);

    // S12 player stats; undo removes the win
    const p = await H.api.getPlayer(G.id);
    expect(p.profile?.display_name).toBe('Smoke Guest');
    expect(p.stats.games).toBe(1);
    await G.api.undoGame(game);
    expect((await G.api.getPlayer(G.id)).stats.games).toBe(0);

    // S15 report, S14 data export, pings and preferences
    await G.api.report({ diwaniya: dw }, 'other', 'smoke test');
    await G.api.updatePrivate({ ping_games: ['kout'], ping_daily_cap: 2, lang: 'en' });
    await G.api.updateProfile({ games: ['kout', 'baloot'] });
    const dump = await G.api.exportMyData();
    expect((dump.requests as unknown[]).length).toBe(1);
    expect((dump.reports as unknown[]).length).toBe(1);

    // Blocks: host blocks guest, guest disappears from the host's world
    await G.api.leaveSeat(table);
    await H.api.block(G.id);
    expect((await H.api.listBlocked()).map((b) => b.blocked_id)).toEqual([G.id]);
    expect((await G.api.listTonight()).some((n) => n.diwaniya?.id === dw)).toBe(false);
    await H.api.unblock(G.id);

    await H.api.closeNight(night);
    expect(await H.api.getOpenNight(dw)).toBeNull();
    await H.api.markRead((await H.api.listInbox()).map((i) => i.id));
    expect(await H.api.unreadCount()).toBe(0);
  }, 60_000);
});
