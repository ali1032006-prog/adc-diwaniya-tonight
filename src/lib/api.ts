// Every read and write the screens make. RLS and the SECURITY DEFINER RPCs in
// supabase/migrations decide who may do what; this file only shapes the calls.
import { supabase } from './supabase';

export type Game = 'kout' | 'baloot' | 'tarneeb' | 'trix';
export const GAMES: Game[] = ['kout', 'baloot', 'tarneeb', 'trix'];
export type RulePack = 'kout_bo6' | 'kout_bo4' | 'baloot' | 'tarneeb_31' | 'tarneeb_41' | 'tarneeb_61' | 'trix';
export const RULE_PACKS: RulePack[] = ['kout_bo6', 'kout_bo4', 'baloot', 'tarneeb_31', 'tarneeb_41', 'tarneeb_61', 'trix'];
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'arrived' | 'no_show';

export interface SeatRow {
  seat_no: number;
  user_id: string | null;
  walk_in_name: string | null;
  profile?: { display_name: string } | null;
}
export interface TableRow {
  id: string;
  game: Game;
  seat_count: number;
  label: string;
  queue_mode: 'rotation' | 'winner_stays';
  need_one: boolean;
  seats: SeatRow[];
  queue?: { user_id: string; joined_at: string; profile?: { display_name: string } | null }[];
}
export interface DiwaniyaLite {
  id: string;
  name: string;
  area: string;
  usual_slot: string;
  host_id: string;
  visibility: 'public' | 'followers';
}
export interface Diwaniya extends DiwaniyaLite {
  about: string;
  rules: string;
  approval: 'host' | 'regulars_auto';
  guest_cap: number;
  pin_unlock_minutes: number;
  host?: { display_name: string } | null;
}
export interface NightRow {
  id: string;
  starts_at: string;
  status: 'open' | 'closed';
  pin_unlock_at?: string;
  diwaniya_id?: string;
  diwaniya?: DiwaniyaLite | null;
  tables: TableRow[];
}
export interface RequestRow {
  id: string;
  night_id: string;
  table_id: string | null;
  status: RequestStatus;
  eta_minutes: number;
  note: string;
  auto_approved: boolean;
  created_at: string;
  user?: { id: string; display_name: string; area: string } | null;
}
export interface Profile {
  id: string;
  display_name: string;
  area: string;
  games: Game[];
  created_at: string;
}
export interface ProfilePrivate {
  birth_date: string;
  terms_accepted_at: string;
  male_confirmed_at: string;
  lang: 'ar' | 'en';
  numerals: 'auto' | 'arab' | 'latn';
  theme: 'auto' | 'night' | 'day';
  ping_games: Game[];
  ping_areas: string[];
  quiet_start: string | null;
  quiet_end: string | null;
  ping_daily_cap: number;
}
export type InboxKind = 'request' | 'approved' | 'declined' | 'auto_approved' | 'cancelled' | 'need_one' | 'no_show';
export interface InboxRow {
  id: string;
  kind: InboxKind;
  diwaniya_id: string | null;
  night_id: string | null;
  request_id: string | null;
  table_id: string | null;
  created_at: string;
  read_at: string | null;
  diwaniya?: { name: string } | null;
}
export interface Standing {
  diwaniya_id: string;
  user_id: string;
  name: string;
  played: number;
  wins: number;
}
export interface PlayedGame {
  id: string;
  rule_pack: RulePack;
  played_at: string;
  undone_at: string | null;
  recorded_by: string | null;
  results: { seat: number; name: string; team: number; points: number; won: boolean; user_id: string | null }[];
}
export interface ResultInput {
  seat: number;
  user_id: string | null;
  name: string;
  team: number;
  points: number;
  won: boolean;
}

/** A failure the screens can explain: `code` is the Postgres SQLSTATE or our own tag. */
export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function db() {
  const c = supabase();
  if (!c) throw new ApiError('offline', 'backend not configured');
  return c;
}

type Res<T> = { data: T | null; error: { code?: string; message: string } | null };
function unwrap<T>(r: Res<T>): T {
  if (r.error) throw new ApiError(r.error.code ?? 'unknown', r.error.message);
  return r.data as T;
}

async function uid(): Promise<string> {
  const { data } = await db().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError('28000', 'sign in first');
  return id;
}

const SEATS = 'seats(seat_no,user_id,walk_in_name,profile:profiles(display_name))';
const QUEUE = 'queue:table_queue(user_id,joined_at,profile:profiles(display_name))';
const TABLES = `tables:game_tables(id,game,seat_count,label,queue_mode,need_one,${SEATS},${QUEUE})`;
const DW_LITE = 'id,name,area,usual_slot,host_id,visibility';
const DW_FULL = `${DW_LITE},about,rules,approval,guest_cap,pin_unlock_minutes,host:profiles!diwaniyas_host_id_fkey(display_name)`;

function sortTables(n: NightRow): NightRow {
  return { ...n, tables: [...(n.tables ?? [])].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)) };
}

// ---------------------------------------------------------------- account

export async function getMe(): Promise<{ profile: Profile | null; priv: ProfilePrivate | null }> {
  const me = await uid();
  const [p, q] = await Promise.all([
    db().from('profiles').select('id,display_name,area,games,created_at').eq('id', me).maybeSingle(),
    db().from('profile_private').select('*').eq('user_id', me).maybeSingle(),
  ]);
  return { profile: unwrap(p) as Profile | null, priv: unwrap(q) as ProfilePrivate | null };
}

/** S3: the server checks 18+ (ruling B) and the male confirmation (ruling C) again; the form only helps. */
export async function completeProfile(name: string, area: string, birthDate: string, acceptTerms: boolean, confirmMale: boolean) {
  unwrap(
    await db().rpc('complete_profile', {
      p_name: name,
      p_area: area,
      p_birth_date: birthDate,
      p_accept_terms: acceptTerms,
      p_confirm_male: confirmMale,
    }),
  );
}

export async function updateProfile(p: Partial<Pick<Profile, 'display_name' | 'area' | 'games'>>) {
  const me = await uid();
  unwrap(await db().from('profiles').update(p).eq('id', me));
}

export async function updatePrivate(p: Partial<Omit<ProfilePrivate, 'birth_date' | 'terms_accepted_at' | 'male_confirmed_at'>>) {
  const me = await uid();
  unwrap(await db().from('profile_private').update(p).eq('user_id', me));
}

/** Everything we hold about the signed-in person, for "Download my data". */
export async function exportMyData(): Promise<Record<string, unknown>> {
  const me = await uid();
  const pick = async (table: string, col: string) => unwrap(await db().from(table).select('*').eq(col, me));
  return {
    exported_at: new Date().toISOString(),
    profile: await pick('profiles', 'id'),
    private: await pick('profile_private', 'user_id'),
    diwaniyas: await pick('diwaniyas', 'host_id'),
    requests: await pick('requests', 'user_id'),
    follows: await pick('follows', 'user_id'),
    blocks: await pick('blocks', 'blocker_id'),
    reports: await pick('reports', 'reporter_id'),
    inbox: await pick('inbox', 'user_id'),
  };
}

// ---------------------------------------------------------------- Tonight (S5)

export async function listTonight(): Promise<NightRow[]> {
  const rows = unwrap(
    await db()
      .from('nights')
      .select(`id,starts_at,status,diwaniya:diwaniyas!inner(${DW_LITE}),${TABLES}`)
      .eq('status', 'open')
      .order('starts_at', { ascending: true })
      .limit(60),
  ) as unknown as NightRow[];
  return rows.map(sortTables);
}

export function openSeats(t: Pick<TableRow, 'seat_count' | 'seats'>): number {
  return Math.max(0, t.seat_count - (t.seats?.length ?? 0));
}

// ---------------------------------------------------------------- Diwaniya page (S6/S7)

export async function getDiwaniya(id: string): Promise<Diwaniya | null> {
  return unwrap(await db().from('diwaniyas').select(DW_FULL).eq('id', id).maybeSingle()) as unknown as Diwaniya | null;
}

export async function getOpenNight(diwaniyaId: string): Promise<NightRow | null> {
  const n = unwrap(
    await db()
      .from('nights')
      .select(`id,starts_at,status,pin_unlock_at,diwaniya_id,${TABLES}`)
      .eq('diwaniya_id', diwaniyaId)
      .eq('status', 'open')
      .maybeSingle(),
  ) as unknown as NightRow | null;
  return n ? sortTables(n) : null;
}

export async function getMyRequest(nightId: string): Promise<RequestRow | null> {
  const me = await uid();
  const rows = unwrap(
    await db()
      .from('requests')
      .select('id,night_id,table_id,status,eta_minutes,note,auto_approved,created_at')
      .eq('night_id', nightId)
      .eq('user_id', me)
      .order('created_at', { ascending: false })
      .limit(1),
  ) as RequestRow[];
  return rows[0] ?? null;
}

export async function getPin(diwaniyaId: string): Promise<{ lat: number; lng: number; directions: string } | null> {
  return unwrap(await db().from('diwaniya_pins').select('lat,lng,directions').eq('diwaniya_id', diwaniyaId).maybeSingle());
}

export async function setPin(diwaniyaId: string, lat: number, lng: number, directions: string) {
  unwrap(await db().from('diwaniya_pins').upsert({ diwaniya_id: diwaniyaId, lat, lng, directions }));
}

export async function isFollowing(diwaniyaId: string): Promise<boolean> {
  const me = await uid();
  const rows = unwrap(await db().from('follows').select('diwaniya_id').eq('diwaniya_id', diwaniyaId).eq('user_id', me)) as unknown[];
  return rows.length > 0;
}

export async function setFollow(diwaniyaId: string, on: boolean) {
  const me = await uid();
  if (on) unwrap(await db().from('follows').insert({ user_id: me, diwaniya_id: diwaniyaId }));
  else unwrap(await db().from('follows').delete().eq('user_id', me).eq('diwaniya_id', diwaniyaId));
}

export async function listFollowed(): Promise<DiwaniyaLite[]> {
  const me = await uid();
  const rows = unwrap(await db().from('follows').select(`diwaniya:diwaniyas(${DW_LITE})`).eq('user_id', me)) as unknown as {
    diwaniya: DiwaniyaLite | null;
  }[];
  return rows.map((r) => r.diwaniya).filter((d): d is DiwaniyaLite => !!d);
}

export async function requestSeat(nightId: string, tableId: string | null, etaMinutes: number, note: string, acceptRules: boolean) {
  return unwrap(
    await db().rpc('request_seat', {
      p_night: nightId,
      p_table: tableId,
      p_eta_minutes: etaMinutes,
      p_note: note,
      p_accept_rules: acceptRules,
    }),
  ) as string;
}

export async function cancelRequest(id: string) {
  unwrap(await db().rpc('cancel_request', { p_request: id }));
}

export async function checkIn(tableId: string, seatNo: number) {
  return unwrap(await db().rpc('check_in', { p_table: tableId, p_seat_no: seatNo })) as string;
}

export async function leaveSeat(tableId: string) {
  const me = await uid();
  unwrap(await db().from('seats').delete().eq('table_id', tableId).eq('user_id', me));
}

export async function joinQueue(tableId: string) {
  const me = await uid();
  unwrap(await db().from('table_queue').insert({ table_id: tableId, user_id: me }));
}

export async function leaveQueue(tableId: string, userId?: string) {
  const who = userId ?? (await uid());
  unwrap(await db().from('table_queue').delete().eq('table_id', tableId).eq('user_id', who));
}

// ---------------------------------------------------------------- host board (S8) and settings (S9)

export async function myDiwaniyas(): Promise<Diwaniya[]> {
  const me = await uid();
  const [own, co] = await Promise.all([
    db().from('diwaniyas').select(DW_FULL).eq('host_id', me).order('created_at'),
    db().from('cohosts').select(`diwaniya:diwaniyas(${DW_FULL})`).eq('user_id', me),
  ]);
  const a = unwrap(own) as unknown as Diwaniya[];
  const b = (unwrap(co) as unknown as { diwaniya: Diwaniya | null }[]).map((r) => r.diwaniya).filter((d): d is Diwaniya => !!d);
  return [...a, ...b.filter((d) => !a.some((x) => x.id === d.id))];
}

export async function createDiwaniya(name: string, area: string) {
  const me = await uid();
  return unwrap(await db().from('diwaniyas').insert({ host_id: me, name, area }).select('id').single()) as { id: string };
}

export type DiwaniyaSettings = Pick<
  Diwaniya,
  'name' | 'area' | 'about' | 'rules' | 'visibility' | 'approval' | 'guest_cap' | 'pin_unlock_minutes' | 'usual_slot'
>;
export async function updateDiwaniya(id: string, s: Partial<DiwaniyaSettings>) {
  unwrap(await db().from('diwaniyas').update(s).eq('id', id));
}

export async function openNight(diwaniyaId: string, startsAt: Date) {
  return unwrap(
    await db().from('nights').insert({ diwaniya_id: diwaniyaId, starts_at: startsAt.toISOString() }).select('id').single(),
  ) as { id: string };
}

export async function closeNight(nightId: string) {
  unwrap(await db().from('nights').update({ status: 'closed' }).eq('id', nightId));
}

export async function addTable(nightId: string, game: Game, seatCount: number, label: string) {
  unwrap(await db().from('game_tables').insert({ night_id: nightId, game, seat_count: seatCount, label }));
}

export async function removeTable(tableId: string) {
  unwrap(await db().from('game_tables').delete().eq('id', tableId));
}

export async function setQueueMode(tableId: string, mode: TableRow['queue_mode']) {
  unwrap(await db().from('game_tables').update({ queue_mode: mode }).eq('id', tableId));
}

export async function seatWalkIn(tableId: string, seatNo: number, name: string) {
  unwrap(await db().from('seats').insert({ table_id: tableId, seat_no: seatNo, walk_in_name: name }));
}

export async function clearSeat(tableId: string, seatNo: number) {
  unwrap(await db().from('seats').delete().eq('table_id', tableId).eq('seat_no', seatNo));
}

export async function setNeedOne(tableId: string, on: boolean) {
  return unwrap(await db().rpc('set_need_one', { p_table: tableId, p_on: on })) as number;
}

export async function listRequests(nightId: string): Promise<RequestRow[]> {
  return unwrap(
    await db()
      .from('requests')
      .select('id,night_id,table_id,status,eta_minutes,note,auto_approved,created_at,user:profiles!requests_user_id_fkey(id,display_name,area)')
      .eq('night_id', nightId)
      .order('created_at'),
  ) as unknown as RequestRow[];
}

export async function decideRequest(id: string, approve: boolean) {
  return unwrap(await db().rpc('decide_request', { p_request: id, p_approve: approve })) as string;
}

export async function markRequest(id: string, status: 'arrived' | 'no_show') {
  unwrap(await db().rpc('mark_request', { p_request: id, p_status: status }));
}

export async function listRegulars(diwaniyaId: string) {
  return unwrap(
    await db().from('regulars').select('user_id,added_at,profile:profiles(display_name)').eq('diwaniya_id', diwaniyaId),
  ) as unknown as { user_id: string; profile: { display_name: string } | null }[];
}

export async function addRegular(diwaniyaId: string, userId: string) {
  unwrap(await db().from('regulars').insert({ diwaniya_id: diwaniyaId, user_id: userId }));
}

export async function removeRegular(diwaniyaId: string, userId: string) {
  unwrap(await db().from('regulars').delete().eq('diwaniya_id', diwaniyaId).eq('user_id', userId));
}

export async function listCohosts(diwaniyaId: string) {
  return unwrap(
    await db().from('cohosts').select('user_id,profile:profiles(display_name)').eq('diwaniya_id', diwaniyaId),
  ) as unknown as { user_id: string; profile: { display_name: string } | null }[];
}

export async function addCohost(diwaniyaId: string, userId: string) {
  unwrap(await db().from('cohosts').insert({ diwaniya_id: diwaniyaId, user_id: userId }));
}

export async function removeCohost(diwaniyaId: string, userId: string) {
  unwrap(await db().from('cohosts').delete().eq('diwaniya_id', diwaniyaId).eq('user_id', userId));
}

// ---------------------------------------------------------------- score (S10) and league (S11)

export async function recordGame(diwaniyaId: string, pack: RulePack, tableId: string | null, results: ResultInput[]) {
  return unwrap(
    await db().rpc('record_game', { p_diwaniya: diwaniyaId, p_rule_pack: pack, p_table: tableId, p_results: results }),
  ) as string;
}

export async function undoGame(gameId: string) {
  unwrap(await db().rpc('undo_game', { p_game: gameId }));
}

export async function standings(diwaniyaId: string): Promise<Standing[]> {
  const rows = unwrap(
    await db().from('league_standings').select('diwaniya_id,user_id,name,played,wins').eq('diwaniya_id', diwaniyaId),
  ) as Standing[];
  return rankStandings(rows);
}

/** Most wins first, then the better win rate, then fewer games, then name. */
export function rankStandings(rows: Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) => b.wins - a.wins || b.wins / Math.max(b.played, 1) - a.wins / Math.max(a.played, 1) || a.played - b.played || a.name.localeCompare(b.name),
  );
}

export async function recentGames(diwaniyaId: string, limit = 20): Promise<PlayedGame[]> {
  return unwrap(
    await db()
      .from('played_games')
      .select('id,rule_pack,played_at,undone_at,recorded_by,results:game_results(seat,name,team,points,won,user_id)')
      .eq('diwaniya_id', diwaniyaId)
      .order('played_at', { ascending: false })
      .limit(limit),
  ) as unknown as PlayedGame[];
}

/** This month's crown: most wins among games played since the 1st (Kuwait time), ties share it. */
export function monthlyCrown(games: PlayedGame[], now = new Date()): string[] {
  const kw = new Date(now.getTime() + 3 * 3600_000);
  const start = Date.UTC(kw.getUTCFullYear(), kw.getUTCMonth(), 1) - 3 * 3600_000;
  const wins = new Map<string, number>();
  for (const g of games) {
    if (g.undone_at || new Date(g.played_at).getTime() < start) continue;
    for (const r of g.results) if (r.won) wins.set(r.name, (wins.get(r.name) ?? 0) + 1);
  }
  const top = Math.max(0, ...wins.values());
  return top === 0 ? [] : [...wins].filter(([, w]) => w === top).map(([n]) => n).sort();
}

/** Diwaniyas whose league I can open: ones I run, follow, or have played at. */
export async function leagueDiwaniyas(): Promise<DiwaniyaLite[]> {
  const [mine, followed] = await Promise.all([myDiwaniyas(), listFollowed()]);
  const all = [...mine, ...followed];
  return all.filter((d, i) => all.findIndex((x) => x.id === d.id) === i);
}

// ---------------------------------------------------------------- players (S12), blocks, reports (S15)

export async function getPlayer(id: string) {
  const [p, s] = await Promise.all([
    db().from('profiles').select('id,display_name,area,games,created_at').eq('id', id).maybeSingle(),
    db().rpc('player_stats', { p_user: id }),
  ]);
  return {
    profile: unwrap(p) as Profile | null,
    stats: unwrap(s) as { nights_shown: number; no_shows: number; games: number; wins: number },
  };
}

export async function listBlocked() {
  const me = await uid();
  return unwrap(
    await db().from('blocks').select('blocked_id,created_at,profile:profiles!blocks_blocked_id_fkey(display_name)').eq('blocker_id', me),
  ) as unknown as { blocked_id: string; profile: { display_name: string } | null }[];
}

export async function block(userId: string) {
  const me = await uid();
  unwrap(await db().from('blocks').insert({ blocker_id: me, blocked_id: userId }));
}

export async function unblock(userId: string) {
  const me = await uid();
  unwrap(await db().from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId));
}

export type ReportReason = 'safety' | 'harassment' | 'no_show' | 'fake' | 'other';
export async function report(target: { user?: string; diwaniya?: string }, reason: ReportReason, details: string) {
  unwrap(
    await db()
      .from('reports')
      .insert({ target_user: target.user ?? null, target_diwaniya: target.diwaniya ?? null, reason, details }),
  );
}

// ---------------------------------------------------------------- inbox (S13)

export async function listInbox(): Promise<InboxRow[]> {
  return unwrap(
    await db()
      .from('inbox')
      .select('id,kind,diwaniya_id,night_id,request_id,table_id,created_at,read_at,diwaniya:diwaniyas(name)')
      .order('created_at', { ascending: false })
      .limit(80),
  ) as unknown as InboxRow[];
}

export async function unreadCount(): Promise<number> {
  const r = await db().from('inbox').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (r.error) throw new ApiError(r.error.code ?? 'unknown', r.error.message);
  return r.count ?? 0;
}

export async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  unwrap(await db().from('inbox').update({ read_at: new Date().toISOString() }).in('id', ids));
}

// ---------------------------------------------------------------- live updates

/** Re-run `onChange` whenever one of the named tables changes (Realtime honours RLS). Returns the unsubscribe. */
export function subscribe(name: string, tables: string[], onChange: () => void): () => void {
  const c = supabase();
  if (!c) return () => {};
  let ch = c.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`);
  for (const table of tables) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  ch.subscribe();
  return () => {
    void c.removeChannel(ch);
  };
}
