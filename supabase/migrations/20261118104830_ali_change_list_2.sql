-- Ali's change list 2 (ADC-LOG-764, 2026-11-18 13:42 Kuwait), database part:
-- (2) a written address with the map pin, readable exactly like the pin (pins_read: managers, and
--     approved guests from tonight's unlock time). It lives in the pin row, so no new policy can drift.
-- (3) live scoring: a score sheet per game with its rounds, saved as they are played, synced on
--     Realtime to everyone who may score that table, undo per round, and finish sends the running
--     totals to the league through record_game. Who may score is private.can_score, unchanged.
-- Tests: supabase/tests/ali_changes2_test.sql (red on a7d3371), the whole suite green after.

-- ---------------------------------------------------------------- (2) the address
alter table public.diwaniya_pins add column address text not null default ''
  check (char_length(address) <= 200 and address !~ '[[:cntrl:]]');

-- ---------------------------------------------------------------- (3) seated players, one check
-- The player list rules record_game has enforced since ADC-LOG-754, now shared with start_score:
-- 2 to 6 seats, known accounts only, nobody twice, every seat named, and every named account
-- really at this diwaniya (seated at this table, approved for a night here, a regular or a
-- manager), never someone hidden, held or blocked with the scorer or the host.
create function private.check_score_players(p_diwaniya uuid, p_table uuid, p_players jsonb)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_n int; v_host uuid;
begin
  if jsonb_typeof(p_players) <> 'array' then raise exception 'results must be a list' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_players);
  if v_n < 2 or v_n > 6 then raise exception 'a game has 2 to 6 players' using errcode = '22023'; end if;
  if p_table is not null and private.table_diwaniya(p_table) is distinct from p_diwaniya then
    raise exception 'table not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_players) e
             where nullif(e->>'user_id', '') is not null
               and not exists (select 1 from public.profiles p where p.id = (e->>'user_id')::uuid)) then
    raise exception 'unknown player' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct coalesce(nullif(e->>'user_id', ''), 'guest:' || lower(btrim(coalesce(e->>'name', '')))))
      from jsonb_array_elements(p_players) e) then
    raise exception 'a player is in this game twice' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_players) e
             where nullif(e->>'user_id', '') is null and btrim(coalesce(e->>'name', '')) = '') then
    raise exception 'every seat needs a name' using errcode = '22023';
  end if;
  select host_id into v_host from public.diwaniyas where id = p_diwaniya;
  if exists (
    select 1 from jsonb_array_elements(p_players) e
    cross join lateral (select (nullif(e->>'user_id', ''))::uuid as u) x
    where x.u is not null and x.u <> auth.uid()
      and (not private.profile_live(x.u)
           or private.blocked_between(auth.uid(), x.u)
           or private.blocked_between(v_host, x.u)
           or not (
             (p_table is not null and exists (select 1 from public.seats s where s.table_id = p_table and s.user_id = x.u))
             or exists (select 1 from public.requests q join public.nights n on n.id = q.night_id
                        where n.diwaniya_id = p_diwaniya and q.user_id = x.u and q.status in ('approved','arrived'))
             or exists (select 1 from public.regulars r where r.diwaniya_id = p_diwaniya and r.user_id = x.u)
             or private.manages(x.u, p_diwaniya)))) then
    raise exception 'a player was not at this diwaniya' using errcode = '22023';
  end if;
end $$;

create or replace function public.record_game(p_diwaniya uuid, p_rule_pack text, p_table uuid, p_results jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.can_score(p_diwaniya, p_table) then
    raise exception 'only its managers, regulars and guests checked in tonight can score here' using errcode = '42501';
  end if;
  perform private.check_score_players(p_diwaniya, p_table, p_results);
  insert into public.played_games (diwaniya_id, table_id, rule_pack, recorded_by)
    values (p_diwaniya, p_table, p_rule_pack, auth.uid()) returning id into v_id;
  insert into public.game_results (game_id, seat, user_id, name, team, points, won)
  select v_id, (e->>'seat')::smallint,
         case when p.id is not null then p.id end,
         left(btrim(regexp_replace(coalesce(p.display_name, e->>'name', ''), '[[:cntrl:]]', '', 'g')), 40),
         (e->>'team')::smallint, (e->>'points')::int, (e->>'won')::boolean
  from jsonb_array_elements(p_results) e
  left join public.profiles p on p.id = nullif(e->>'user_id', '')::uuid;
  return v_id;
end $$;

-- ---------------------------------------------------------------- (3) score sheets and rounds
create table public.score_sheets (
  id uuid primary key default gen_random_uuid(),
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  table_id uuid references public.game_tables(id) on delete cascade,
  rule_pack text not null check (rule_pack in ('kout_bo6','kout_bo4','baloot','tarneeb_31','tarneeb_41','tarneeb_61','trix')),
  teams smallint not null check (teams in (2, 4)),
  -- [{seat, user_id|null, name, team}], checked by private.check_score_players at start
  players jsonb not null,
  started_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open','finished','discarded')),
  game_id uuid references public.played_games(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open sheet per table, so the whole table scores on the same sheet; a table-less sheet
-- belongs to the person who started it (one open at a time per diwaniya).
create unique index score_sheets_one_open_table on public.score_sheets (table_id) where status = 'open' and table_id is not null;
create unique index score_sheets_one_open_own on public.score_sheets (diwaniya_id, started_by) where status = 'open' and table_id is null;
create index on public.score_sheets (diwaniya_id, status);

create table public.score_rounds (
  sheet_id uuid not null references public.score_sheets(id) on delete cascade,
  round_no int not null check (round_no between 1 and 300),
  points int[] not null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  primary key (sheet_id, round_no)
);

alter table public.score_sheets enable row level security;
alter table public.score_rounds enable row level security;
-- Read: whoever may score that table (or that diwaniya, for a table-less sheet started by him)
-- and its managers. No insert/update/delete grants: every write goes through the functions below.
create policy sheets_read on public.score_sheets for select to authenticated
  using (private.can_manage(diwaniya_id)
         or (private.can_score(diwaniya_id, table_id) and (table_id is not null or started_by = auth.uid())));
create policy rounds_read on public.score_rounds for select to authenticated
  using (exists (select 1 from public.score_sheets s where s.id = sheet_id));
revoke all on public.score_sheets, public.score_rounds from anon, authenticated;
grant select on public.score_sheets, public.score_rounds to authenticated;

-- The sheet a caller may write, locked: open, and he may score its table now.
create function private.sheet_for_write(p_sheet uuid) returns public.score_sheets
language plpgsql security definer set search_path = '' as $$
declare v public.score_sheets;
begin
  select * into v from public.score_sheets where id = p_sheet for update;
  if v.id is null or not (private.can_manage(v.diwaniya_id)
                          or (private.can_score(v.diwaniya_id, v.table_id) and (v.table_id is not null or v.started_by = auth.uid()))) then
    raise exception 'score sheet not found' using errcode = 'P0002';
  end if;
  if v.status <> 'open' then raise exception 'this game is already over' using errcode = '22023'; end if;
  return v;
end $$;

create function public.start_score(p_diwaniya uuid, p_rule_pack text, p_table uuid, p_players jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_teams smallint;
begin
  if not private.can_score(p_diwaniya, p_table) then
    raise exception 'only its managers, regulars and guests checked in tonight can score here' using errcode = '42501';
  end if;
  if p_rule_pack not in ('kout_bo6','kout_bo4','baloot','tarneeb_31','tarneeb_41','tarneeb_61','trix') then
    raise exception 'unknown game' using errcode = '22023';
  end if;
  perform private.check_score_players(p_diwaniya, p_table, p_players);
  v_teams := case when p_rule_pack = 'trix' then 4 else 2 end;
  if exists (select 1 from jsonb_array_elements(p_players) e
             where (e->>'team') is null or (e->>'team')::int not between 1 and v_teams
                or (e->>'seat') is null or (e->>'seat')::int not between 1 and 6) then
    raise exception 'every seat needs a team' using errcode = '22023';
  end if;
  begin
    insert into public.score_sheets (diwaniya_id, table_id, rule_pack, teams, players, started_by)
    select p_diwaniya, p_table, p_rule_pack, v_teams,
           (select jsonb_agg(jsonb_build_object(
                     'seat', (e->>'seat')::int,
                     'user_id', p.id,
                     'name', left(btrim(regexp_replace(coalesce(p.display_name, e->>'name', ''), '[[:cntrl:]]', '', 'g')), 40),
                     'team', (e->>'team')::int) order by (e->>'seat')::int)
              from jsonb_array_elements(p_players) e
              left join public.profiles p on p.id = nullif(e->>'user_id', '')::uuid),
           auth.uid()
    returning id into v_id;
  exception when unique_violation then
    raise exception 'a game is already being scored here' using errcode = '23505';
  end;
  return v_id;
end $$;

create function public.add_round(p_sheet uuid, p_points int[])
returns int language plpgsql security definer set search_path = '' as $$
declare v public.score_sheets; v_no int;
begin
  v := private.sheet_for_write(p_sheet);
  if p_points is null or coalesce(array_length(p_points, 1), 0) <> v.teams or array_ndims(p_points) <> 1
     or exists (select 1 from unnest(p_points) x where x is null or x not between -1000 and 1000) then
    raise exception 'one score between -1000 and 1000 for each team' using errcode = '22023';
  end if;
  select coalesce(max(round_no), 0) + 1 into v_no from public.score_rounds where sheet_id = p_sheet;
  if v_no > 300 then raise exception 'too many rounds' using errcode = '22023'; end if;
  insert into public.score_rounds (sheet_id, round_no, points, added_by) values (p_sheet, v_no, p_points, auth.uid());
  update public.score_sheets set updated_at = now() where id = p_sheet;
  return v_no;
end $$;

create function public.undo_round(p_sheet uuid, p_round int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.sheet_for_write(p_sheet);
  update public.score_rounds set undone_at = now() where sheet_id = p_sheet and round_no = p_round and undone_at is null;
  if not found then raise exception 'round not found' using errcode = 'P0002'; end if;
  update public.score_sheets set updated_at = now() where id = p_sheet;
end $$;

create function public.discard_score(p_sheet uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.sheet_for_write(p_sheet);
  update public.score_sheets set status = 'discarded', updated_at = now() where id = p_sheet;
end $$;

-- Finish: the running totals become one league game (record_game re-checks who may score and
-- the players), and the sheet closes with a link to it.
create function public.finish_score(p_sheet uuid, p_winner smallint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.score_sheets; v_tot int[]; v_game uuid;
begin
  v := private.sheet_for_write(p_sheet);
  if p_winner is null or p_winner < 1 or p_winner > v.teams then
    raise exception 'pick the winning team' using errcode = '22023';
  end if;
  if not exists (select 1 from public.score_rounds where sheet_id = p_sheet and undone_at is null) then
    raise exception 'score at least one round first' using errcode = '22023';
  end if;
  select array_agg(coalesce((select sum(r.points[i]) from public.score_rounds r
                             where r.sheet_id = p_sheet and r.undone_at is null), 0)::int order by i)
    into v_tot from generate_series(1, v.teams) i;
  v_game := public.record_game(v.diwaniya_id, v.rule_pack, v.table_id,
    (select jsonb_agg(jsonb_build_object(
              'seat', (e->>'seat')::int, 'user_id', e->>'user_id', 'name', e->>'name', 'team', (e->>'team')::int,
              'points', v_tot[(e->>'team')::int], 'won', (e->>'team')::int = p_winner))
       from jsonb_array_elements(v.players) e));
  update public.score_sheets set status = 'finished', game_id = v_game, updated_at = now() where id = p_sheet;
  return v_game;
end $$;

revoke all on function private.check_score_players(uuid, uuid, jsonb), private.sheet_for_write(uuid) from public, anon, authenticated;
revoke all on function public.start_score(uuid, text, uuid, jsonb), public.add_round(uuid, int[]), public.undo_round(uuid, int),
  public.discard_score(uuid), public.finish_score(uuid, smallint) from public, anon;
grant execute on function public.start_score(uuid, text, uuid, jsonb), public.add_round(uuid, int[]), public.undo_round(uuid, int),
  public.discard_score(uuid), public.finish_score(uuid, smallint) to authenticated;

-- The whole table sees each round land (Realtime honours sheets_read / rounds_read).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'score_rounds') then
      alter publication supabase_realtime add table public.score_rounds;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'score_sheets') then
      alter publication supabase_realtime add table public.score_sheets;
    end if;
  end if;
end $$;
