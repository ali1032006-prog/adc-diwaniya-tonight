// The TV side of "Diwaniya on the TV" (ADC-RES-54, Ali's approval ADC-LOG-817, without the empty-seat code).
// The TV never signs in: its own Supabase client keeps no session, so even on the host's own laptop
// it calls the one public door, tv_state(code), as anon. A Realtime broadcast on the room's
// unguessable topic says "something changed" (it carries no data); the TV reads tv_state again and
// polls as a fallback, so a TV whose socket drops still keeps up.
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Draw, Game, RulePack } from '../lib/api';

export const CODE_ALPHABET = 'ACDEFHJKLMNPRTUVWXY3479';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{6}$`);

/** What the TV room code looks like once spaces, dashes and case are gone ("k7p 2qx" -> "K7P2QX"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
}
export function isCode(code: string): boolean {
  return CODE_RE.test(code);
}

export interface TvSeat {
  no: number;
  name: string;
}
export interface TvTable {
  label: string;
  game: Game;
  seat_count: number;
  need_one: boolean;
  seats: TvSeat[];
}
export interface TvLive {
  table: string;
  rule_pack: RulePack;
  teams: number;
  players: { name: string; team: number }[];
  totals: number[];
  rounds: number;
  h2h: { a: string; b: string; games: number; a_wins: number; b_wins: number } | null;
}
export interface TvBoard {
  status: 'live';
  topic: string;
  expires_at: string;
  diwaniya: { name: string; area: string };
  night: { starts_at: string };
  tables: TvTable[];
  live: TvLive[];
  season: { name: string; played: number; wins: number }[];
  crown: string[];
  draw: Draw | null;
  tonight: { games: number; last: { rule_pack: RulePack; at: string; winners: string[] }[] };
}
export type TvState = TvBoard | { status: 'unknown' } | { status: 'ended' };

/** Failures the TV can explain: too many tries (54000) or no connection. */
export class TvError extends Error {
  constructor(public kind: 'limit' | 'offline', message: string) {
    super(message);
  }
}

let client: SupabaseClient | null | undefined;
export function tvClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  client =
    url && key
      ? createClient(url, key, {
          // Never a session: no storage, no refresh, no reading a sign-in link from the address.
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'dt-tv-none' },
        })
      : null;
  return client;
}
/** Tests swap the client for a fake. */
export function setTvClientForTests(c: SupabaseClient | null): void {
  client = c;
}

export async function fetchTvState(code: string): Promise<TvState> {
  const c = tvClient();
  if (!c) throw new TvError('offline', 'backend not configured');
  let res: { data: unknown; error: { code?: string; message: string } | null };
  try {
    res = (await c.rpc('tv_state', { p_code: code })) as typeof res;
  } catch (e) {
    throw new TvError('offline', String(e));
  }
  if (res.error) throw new TvError(res.error.code === '54000' ? 'limit' : 'offline', res.error.message);
  return res.data as TvState;
}

/** Listen for "changed"/"ended" pings on the room's topic. Returns the unsubscribe. */
export function listenTv(topic: string, onPing: (ended: boolean) => void, onStatus: (ok: boolean) => void): () => void {
  const c = tvClient();
  if (!c) {
    onStatus(false);
    return () => {};
  }
  let ch: RealtimeChannel | null = c.channel(topic, { config: { private: false, broadcast: { self: false } } });
  ch.on('broadcast', { event: 'changed' }, () => onPing(false))
    .on('broadcast', { event: 'ended' }, () => onPing(true))
    .subscribe((s) => onStatus(s === 'SUBSCRIBED'));
  return () => {
    if (ch) void c.removeChannel(ch);
    ch = null;
  };
}

/** Polling: every 5 s while the broadcast is down, every 30 s as a safety net while it is up. */
export function pollEvery(realtimeUp: boolean): number {
  return realtimeUp ? 30_000 : 5_000;
}

/** Order the draw is revealed in: table by table, seat by seat, then the ones who wait. */
export function revealOrder(d: Draw): { key: string; name: string }[] {
  const out: { key: string; name: string }[] = [];
  d.tables.forEach((t, i) => t.seats.forEach((s) => out.push({ key: `${i}-${s.seat}`, name: s.name })));
  d.waiting.forEach((n, i) => out.push({ key: `w-${i}`, name: n }));
  return out;
}

/** A new draw is worth taking over the screen for while it is fresh (10 minutes). */
export function freshDraw(d: Draw | null, seenNo: number, now = Date.now()): boolean {
  return !!d && d.no > seenNo && now - new Date(d.at).getTime() < 10 * 60_000;
}
