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
  /** Guests may write to the host (Ali's change list 3, item 2); only the host switches it. */
  messages_on: boolean;
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
  /** Only on accounts made before ADC-LOG-751 removed the checkbox; kept, never asked again. */
  male_confirmed_at: string | null;
  lang: 'ar' | 'en';
  numerals: 'auto' | 'arab' | 'latn';
  theme: 'auto' | 'night' | 'day';
  ping_games: Game[];
  ping_areas: string[];
  quiet_start: string | null;
  quiet_end: string | null;
  ping_daily_cap: number;
}
export type InboxKind =
  | 'request'
  | 'approved'
  | 'declined'
  | 'auto_approved'
  | 'cancelled'
  | 'need_one'
  | 'no_show'
  | 'announcement'
  | 'cohost_invite'
  | 'held';
export interface InboxRow {
  id: string;
  kind: InboxKind;
  diwaniya_id: string | null;
  night_id: string | null;
  request_id: string | null;
  table_id: string | null;
  created_at: string;
  read_at: string | null;
  body?: string;
  diwaniya?: { name: string } | null;
}
export interface Standing {
  diwaniya_id: string;
  /** null for a walk-in: he has no account, so the league keeps him by name. */
  user_id: string | null;
  name: string;
  played: number;
  wins: number;
  /** The user id, or 'guest:<lower name>' for a walk-in (league_standings, ADC-LOG-754). */
  player_key: string;
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
const DW_FULL = `${DW_LITE},about,rules,approval,guest_cap,pin_unlock_minutes,messages_on,host:profiles!diwaniyas_host_id_fkey(display_name)`;

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

/** S3: the server checks 18+ (ruling B) and the Terms again; the form only helps. No male checkbox (ADC-LOG-751). */
export async function completeProfile(name: string, area: string, birthDate: string, acceptTerms: boolean) {
  unwrap(
    await db().rpc('complete_profile', {
      p_name: name,
      p_area: area,
      p_birth_date: birthDate,
      p_accept_terms: acceptTerms,
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
    // Only the columns a reporter may read (ADC-SEC-19): never who reviewed it or the admin's note.
    reports: unwrap(
      await db()
        .from('reports')
        .select('id,target_user,target_diwaniya,target_label,reason,details,status,created_at,reviewed_at')
        .eq('reporter_id', me),
    ),
    inbox: await pick('inbox', 'user_id'),
    push_devices: unwrap(await db().from('push_subscriptions').select('endpoint,created_at,last_ok_at').eq('user_id', me)),
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

export interface Pin {
  lat: number;
  lng: number;
  directions: string;
  /** Written address (ADC-LOG-764 item 2), read exactly like the pin. */
  address: string;
}
export async function getPin(diwaniyaId: string): Promise<Pin | null> {
  return unwrap(await db().from('diwaniya_pins').select('lat,lng,directions,address').eq('diwaniya_id', diwaniyaId).maybeSingle());
}

export async function setPin(diwaniyaId: string, lat: number, lng: number, directions: string, address = '') {
  unwrap(await db().from('diwaniya_pins').upsert({ diwaniya_id: diwaniyaId, lat, lng, directions, address }));
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
    db().from('cohosts').select(`diwaniya:diwaniyas(${DW_FULL})`).eq('user_id', me).not('accepted_at', 'is', null),
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
  'name' | 'area' | 'about' | 'rules' | 'visibility' | 'approval' | 'guest_cap' | 'pin_unlock_minutes' | 'usual_slot' | 'messages_on'
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
    await db().from('cohosts').select('user_id,accepted_at,profile:profiles(display_name)').eq('diwaniya_id', diwaniyaId),
  ) as unknown as { user_id: string; accepted_at: string | null; profile: { display_name: string } | null }[];
}

/** Invites the host sends; the person becomes a co-host only when he accepts (ADC-SEC-18). */
export async function addCohost(diwaniyaId: string, userId: string) {
  unwrap(await db().from('cohosts').insert({ diwaniya_id: diwaniyaId, user_id: userId }));
}

export type CohostInvite = { diwaniya_id: string; invited_at: string; diwaniya: { name: string; area: string } | null };
export async function myCohostInvites(): Promise<CohostInvite[]> {
  const me = await uid();
  return unwrap(
    await db()
      .from('cohosts')
      .select('diwaniya_id,invited_at,diwaniya:diwaniyas(name,area)')
      .eq('user_id', me)
      .is('accepted_at', null)
      .order('invited_at', { ascending: false }),
  ) as unknown as CohostInvite[];
}

export async function acceptCohost(diwaniyaId: string) {
  unwrap(await db().rpc('accept_cohost', { p_diwaniya: diwaniyaId }));
}

export async function declineCohost(diwaniyaId: string) {
  const me = await uid();
  unwrap(await db().from('cohosts').delete().eq('diwaniya_id', diwaniyaId).eq('user_id', me));
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
    await db().from('league_standings').select('diwaniya_id,user_id,name,played,wins,player_key').eq('diwaniya_id', diwaniyaId),
  ) as Standing[];
  return rankStandings(rows);
}

/** People a scorer may name at this diwaniya (and table): linked by account instead of typed. */
export interface RosterPerson {
  id: string;
  name: string;
  seat: number | null;
}
export async function scoreRoster(diwaniyaId: string, tableId: string | null): Promise<RosterPerson[]> {
  return ((unwrap(await db().rpc('score_roster', { p_diwaniya: diwaniyaId, p_table: tableId })) as RosterPerson[]) ?? []);
}

// ---------------------------------------------------------------- live scoring (ADC-LOG-764 item 3)
export interface SheetPlayer {
  seat: number;
  user_id: string | null;
  name: string;
  team: number;
}
export interface ScoreSheet {
  id: string;
  diwaniya_id: string;
  table_id: string | null;
  rule_pack: RulePack;
  teams: number;
  players: SheetPlayer[];
  started_by: string;
  status: 'open' | 'finished' | 'discarded';
  game_id: string | null;
  created_at: string;
}
export interface ScoreRound {
  round_no: number;
  points: number[];
  added_by: string | null;
  created_at: string;
  undone_at: string | null;
}
const SHEET = 'id,diwaniya_id,table_id,rule_pack,teams,players,started_by,status,game_id,created_at';

/** The open sheet for this table (or my own table-less one), so a refresh picks the game up again. */
export async function openSheet(diwaniyaId: string, tableId: string | null, me: string | null): Promise<ScoreSheet | null> {
  let q = db().from('score_sheets').select(SHEET).eq('diwaniya_id', diwaniyaId).eq('status', 'open');
  q = tableId ? q.eq('table_id', tableId) : q.is('table_id', null).eq('started_by', me ?? '');
  const rows = unwrap(await q.order('created_at', { ascending: false }).limit(1)) as ScoreSheet[];
  return rows[0] ?? null;
}
export async function getSheet(id: string): Promise<{ sheet: ScoreSheet | null; rounds: ScoreRound[] }> {
  const [sheet, rounds] = await Promise.all([
    db().from('score_sheets').select(SHEET).eq('id', id).maybeSingle(),
    db().from('score_rounds').select('round_no,points,added_by,created_at,undone_at').eq('sheet_id', id).order('round_no'),
  ]);
  return { sheet: unwrap(sheet) as ScoreSheet | null, rounds: (unwrap(rounds) as ScoreRound[]) ?? [] };
}
export async function startScore(diwaniyaId: string, pack: RulePack, tableId: string | null, players: SheetPlayer[]) {
  return unwrap(await db().rpc('start_score', { p_diwaniya: diwaniyaId, p_rule_pack: pack, p_table: tableId, p_players: players })) as string;
}
export async function addRound(sheetId: string, points: number[]) {
  return unwrap(await db().rpc('add_round', { p_sheet: sheetId, p_points: points })) as number;
}
export async function undoRound(sheetId: string, round: number) {
  unwrap(await db().rpc('undo_round', { p_sheet: sheetId, p_round: round }));
}
export async function discardScore(sheetId: string) {
  unwrap(await db().rpc('discard_score', { p_sheet: sheetId }));
}
export async function finishScore(sheetId: string, winner: number) {
  return unwrap(await db().rpc('finish_score', { p_sheet: sheetId, p_winner: winner })) as string;
}
/** Running totals per team from the rounds still standing. */
export function sheetTotals(teams: number, rounds: ScoreRound[]): number[] {
  const out = Array.from({ length: teams }, () => 0);
  for (const r of rounds) if (!r.undone_at) r.points.forEach((p, i) => (out[i] = (out[i] ?? 0) + p));
  return out;
}

/** My diwaniyas (S11 tab inside League, item 6): followed, regular, visited or requested tonight, with tonight's state. */
export interface MyDiwaniya {
  id: string;
  name: string;
  area: string;
  visibility: 'public' | 'followers';
  why: ('follow' | 'regular' | 'visit' | 'tonight')[];
  night_id: string | null;
  starts_at: string | null;
  open_seats: number | null;
  need_one: boolean | null;
  my_status: RequestStatus | null;
  my_request: string | null;
  my_table: string | null;
  seated_table: string | null;
}
export async function myDiwaniyaList(): Promise<MyDiwaniya[]> {
  return ((unwrap(await db().rpc('my_diwaniyas')) as MyDiwaniya[]) ?? []);
}

/** Status of request rows (Inbox shows Approve/Decline only while a request still waits). */
export async function requestStatuses(ids: string[]): Promise<Map<string, RequestStatus>> {
  if (ids.length === 0) return new Map();
  const rows = unwrap(await db().from('requests').select('id,status').in('id', ids)) as { id: string; status: RequestStatus }[];
  return new Map(rows.map((r) => [r.id, r.status]));
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

/** Diwaniyas whose league I can open: ones I run, follow, am a regular of, or have played at. */
export async function leagueDiwaniyas(): Promise<{ id: string; name: string }[]> {
  const [mine, others] = await Promise.all([myDiwaniyas(), myDiwaniyaList()]);
  const all = [...mine, ...others].map((d) => ({ id: d.id, name: d.name }));
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
      .select('id,kind,body,diwaniya_id,night_id,request_id,table_id,created_at,read_at,diwaniya:diwaniyas(name)')
      .neq('kind', 'message') // message pings belong to Messages, counted there
      .order('created_at', { ascending: false })
      .limit(80),
  ) as unknown as InboxRow[];
}

export async function unreadCount(): Promise<number> {
  const r = await db().from('inbox').select('id', { count: 'exact', head: true }).is('read_at', null).neq('kind', 'message');
  if (r.error) throw new ApiError(r.error.code ?? 'unknown', r.error.message);
  return r.count ?? 0;
}

export async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  unwrap(await db().from('inbox').update({ read_at: new Date().toISOString() }).in('id', ids));
}

// ---------------------------------------------------------------- v1 completion: pings, moderation, account

/** S4: keep this browser's push subscription so 'Need one' and approvals reach the phone. */
export async function savePushSubscription(endpoint: string, p256dh: string, auth: string) {
  unwrap(await db().rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }));
}

export async function forgetPushSubscription(endpoint: string) {
  const me = await uid();
  unwrap(await db().from('push_subscriptions').delete().eq('user_id', me).eq('endpoint', endpoint));
}

export async function pushDeviceCount(): Promise<number> {
  const me = await uid();
  const r = await db().from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', me);
  if (r.error) throw new ApiError(r.error.code ?? 'unknown', r.error.message);
  return r.count ?? 0;
}

/** S8: the host's word to tonight's approved guests (5 a night). Returns how many it reached. */
export async function announce(nightId: string, text: string): Promise<number> {
  return unwrap(await db().rpc('announce', { p_night: nightId, p_text: text })) as number;
}

export interface Announcement {
  id: string;
  body: string;
  recipients: number;
  created_at: string;
}
export async function listAnnouncements(nightId: string): Promise<Announcement[]> {
  return unwrap(
    await db().from('announcements').select('id,body,recipients,created_at').eq('night_id', nightId).order('created_at', { ascending: false }),
  ) as Announcement[];
}

export async function followerCount(diwaniyaId: string): Promise<number> {
  const r = await db().from('follows').select('user_id', { count: 'exact', head: true }).eq('diwaniya_id', diwaniyaId);
  if (r.error) throw new ApiError(r.error.code ?? 'unknown', r.error.message);
  return r.count ?? 0;
}

/** S8 quiet-night nudge: when did this diwaniya last open a night? */
export async function lastNightAt(diwaniyaId: string): Promise<string | null> {
  const r = unwrap(
    await db().from('nights').select('starts_at').eq('diwaniya_id', diwaniyaId).order('starts_at', { ascending: false }).limit(1),
  ) as { starts_at: string }[];
  return r[0]?.starts_at ?? null;
}

/** S14: deletes the account and everything that is his; 'DELETE' is the server-side confirm word. */
export async function deleteMyAccount() {
  unwrap(await db().rpc('delete_my_account', { p_confirm: 'DELETE' }));
}

export interface Relations {
  with_me: { partner_games: number; partner_wins: number; rival_games: number; his_wins: number; my_wins: number } | null;
  played_with: { id: string; name: string; games: number; wins_together: number }[];
}
export async function playerRelations(id: string): Promise<Relations> {
  return unwrap(await db().rpc('player_relations', { p_user: id })) as Relations;
}

// Moderation queue (ruling D): every call is checked on the server; non-admins get 42501.
export async function amIAdmin(): Promise<boolean> {
  return Boolean(unwrap(await db().rpc('am_i_admin')));
}

export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export interface QueueItem {
  id: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
  review_note: string;
  target_label: string;
  /** The reporter has a real link to the target (ADC-SEC-20); only these count toward a hold. */
  counts_to_hold?: boolean;
  /** The reported message, kept word for word (Ali's change list 3, item 2). */
  evidence?: string;
  reporter: { id: string | null; name: string | null };
  target_user: { id: string; name: string; hidden_at: string | null; held_at: string | null; open_reports: number } | null;
  target_diwaniya: { id: string; name: string; area: string; hidden_at: string | null; held_at: string | null; open_reports: number } | null;
}
export async function adminReports(status: ReportStatus): Promise<QueueItem[]> {
  return (unwrap(await db().rpc('admin_reports', { p_status: status })) as QueueItem[]) ?? [];
}
export type ReviewAction = 'dismiss' | 'hide_user' | 'hide_diwaniya';
export async function adminReview(reportId: string, action: ReviewAction, note: string) {
  unwrap(await db().rpc('admin_review', { p_report: reportId, p_action: action, p_note: note }));
}
export interface HiddenThing {
  id: string;
  name: string;
  area: string;
  hidden_at: string | null;
  held_at: string | null;
}
export async function adminHidden(): Promise<{ users: HiddenThing[]; diwaniyas: HiddenThing[] }> {
  return unwrap(await db().rpc('admin_hidden')) as { users: HiddenThing[]; diwaniyas: HiddenThing[] };
}
export async function adminUnhide(target: { user?: string; diwaniya?: string }, note: string) {
  unwrap(await db().rpc('admin_unhide', { p_user: target.user ?? null, p_diwaniya: target.diwaniya ?? null, p_note: note }));
}
export interface AdminSummary {
  open: number;
  open_by_reason: Partial<Record<ReportReason, number>>;
  new_7d: number;
  reviewed_7d: number;
  held_users: number;
  held_diwaniyas: number;
  hidden_users: number;
  hidden_diwaniyas: number;
  no_shows_7d: number;
}
export async function adminSummary(): Promise<AdminSummary> {
  return unwrap(await db().rpc('admin_summary')) as AdminSummary;
}

// ---------------------------------------------------------------- messages to hosts (Ali's change list 3, item 2)

export interface ThreadSummary {
  id: string;
  diwaniya_id: string;
  diwaniya_name: string;
  last_at: string;
  role: 'host' | 'guest';
  other_id: string;
  other_name: string;
  last_body: string | null;
  last_mine: boolean | null;
  unread: number;
  /** A block either way: the thread stays readable, nobody can write. */
  blocked: boolean;
  /** False when the diwaniya stopped taking messages (the host can still answer). */
  open: boolean;
}
export interface MessageRow {
  id: string;
  seq: number;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
export const MESSAGE_MAX = 1000;

export async function myThreads(): Promise<ThreadSummary[]> {
  return ((unwrap(await db().rpc('my_threads')) as ThreadSummary[]) ?? []);
}
export async function threadMessages(threadId: string): Promise<MessageRow[]> {
  return (unwrap(
    await db().from('messages').select('id,seq,thread_id,sender_id,body,created_at,read_at').eq('thread_id', threadId).order('seq').limit(500),
  ) as MessageRow[]) ?? [];
}
/** The thread I already have with this diwaniya's host, if any (RLS: only mine are visible). */
export async function threadWith(diwaniyaId: string): Promise<string | null> {
  const me = await uid();
  const rows = unwrap(
    await db().from('message_threads').select('id').eq('diwaniya_id', diwaniyaId).eq('guest_id', me).limit(1),
  ) as { id: string }[];
  return rows[0]?.id ?? null;
}
export async function startThread(diwaniyaId: string, body: string): Promise<string> {
  return unwrap(await db().rpc('start_thread', { p_diwaniya: diwaniyaId, p_body: body })) as string;
}
export async function sendMessage(threadId: string, body: string): Promise<string> {
  return unwrap(await db().rpc('send_message', { p_thread: threadId, p_body: body })) as string;
}
export async function markThreadRead(threadId: string) {
  unwrap(await db().rpc('mark_thread_read', { p_thread: threadId }));
}
export async function unreadMessages(): Promise<number> {
  return (unwrap(await db().rpc('unread_messages')) as number) ?? 0;
}
export async function reportMessage(messageId: string, reason: ReportReason, details: string) {
  unwrap(await db().rpc('report_message', { p_message: messageId, p_reason: reason, p_details: details }));
}

// ---------------------------------------------------------------- Score tab (item 3)

export interface ScoreTarget {
  diwaniya_id: string;
  name: string;
  table_id: string | null;
  game: Game | null;
  seat_count: number | null;
  label: string;
  starts_at: string | null;
  /** seated: his own table; here: checked in tonight; host: he runs it; regular: a regular there. */
  why: 'seated' | 'here' | 'host' | 'regular';
}
export interface ScoreTargets {
  targets: ScoreTarget[];
  /** Why there is nothing to score: approved (sit first), pending (host hasn't answered), none. */
  reason: 'approved' | 'pending' | 'none' | null;
}
export async function scoreTargets(): Promise<ScoreTargets> {
  const r = unwrap(await db().rpc('score_targets')) as ScoreTargets | null;
  return { targets: r?.targets ?? [], reason: r?.reason ?? null };
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
