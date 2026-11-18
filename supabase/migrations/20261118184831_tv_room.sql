-- Diwaniya on the TV (ADC-RES-54; Ali approved it without the QR code, ADC-LOG-817).
-- The host taps "Show on TV" and gets a 6-letter room code; the diwaniya's TV opens /tv, types the
-- code and becomes the room's scoreboard for the night. The TV never signs in: it calls one narrow
-- RPC, tv_state(code), which returns only public scoreboard data (names, scores, the season table,
-- the monthly crown, head-to-head, tonight's draw) and never an id, email, birth date or a person's
-- area. A Realtime broadcast on an unguessable topic tells the TV "something changed" (no data in
-- the message); the TV then reads tv_state again, and polls as a fallback.
-- Room codes expire at night's end (06:00 Kuwait) or when the night closes, can be revoked or
-- rotated, and are rate-limited: wrong codes per client IP, reads per room.
-- Tonight's draw: a fair server-side shuffle of the names the host picks into tonight's tables.
-- Night card: the end-of-night summary for the managers and anyone who was at that night.
-- No QR code anywhere (Ali's words: "don't add the QR code one").
-- Tested by supabase/tests/tv_room_test.sql (red first: function public.tv_open does not exist).

-- ---------------------------------------------------------------- tables (private: RPCs only)
create table private.tv_rooms (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  code text not null unique check (code ~ '^[ACDEFHJKLMNPRTUVWXY3479]{6}$'),
  topic text not null unique default ('tv:' || encode(extensions.gen_random_bytes(16), 'hex')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  win_start timestamptz not null default now(),
  win_calls int not null default 0
);
create index tv_rooms_night on private.tv_rooms (night_id);
create index tv_rooms_live on private.tv_rooms (diwaniya_id) where revoked_at is null;

create table private.tv_misses (
  ip text not null,
  at timestamptz not null default now()
);
create index tv_misses_ip on private.tv_misses (ip, at);

create table private.tv_draws (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  no int not null,
  made_by uuid references public.profiles(id) on delete set null,
  made_at timestamptz not null default now(),
  result jsonb not null,
  unique (night_id, no)
);

alter table private.tv_rooms enable row level security;
alter table private.tv_misses enable row level security;
alter table private.tv_draws enable row level security;
revoke all on private.tv_rooms, private.tv_misses, private.tv_draws from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
-- The caller's IP: Cloudflare sets cf-connecting-ip (a client-sent one is refused at the edge);
-- otherwise the last X-Forwarded-For hop, which the proxy appends.
create function private.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare h json; v text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then h := null; end;
  v := btrim(coalesce(h->>'cf-connecting-ip', ''));
  if v = '' then v := btrim(coalesce(split_part(h->>'x-forwarded-for', ',', -1), '')); end if;
  return coalesce(nullif(left(v, 64), ''), 'unknown');
end $$;

-- The end of a diwaniya night: the next 06:00 in Kuwait.
create function private.night_end(t timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', (t at time zone 'Asia/Kuwait') - interval '6 hours') + interval '30 hours') at time zone 'Asia/Kuwait'
$$;

-- Someone was at night n: held a seat, was marked arrived, or played a game recorded at it.
create function private.attended(n uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u is not null and (
    exists (select 1 from public.seats s join public.game_tables g on g.id = s.table_id where g.night_id = n and s.user_id = u)
    or exists (select 1 from public.requests q where q.night_id = n and q.user_id = u and q.status = 'arrived')
    or exists (select 1 from public.game_results r join public.played_games p on p.id = r.game_id
               join public.game_tables g on g.id = p.table_id where g.night_id = n and r.user_id = u))
$$;

-- Tell every live TV of diwaniya d that something changed (no data in the message). Never lets a
-- broadcast failure break the write that triggered it.
create function private.tv_ping(d uuid, ev text default 'changed') returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select topic from private.tv_rooms where diwaniya_id = d and revoked_at is null and expires_at > now() loop
    begin
      perform realtime.send(jsonb_build_object('at', extract(epoch from now())), ev, r.topic, false);
    exception when others then null;
    end;
  end loop;
end $$;

create function private.tv_ping_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d uuid; rec record;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  if tg_table_name in ('score_sheets', 'played_games', 'nights') then
    d := rec.diwaniya_id;
  elsif tg_table_name = 'score_rounds' then
    select diwaniya_id into d from public.score_sheets where id = rec.sheet_id;
  elsif tg_table_name = 'game_tables' then
    select diwaniya_id into d from public.nights where id = rec.night_id;
  elsif tg_table_name = 'seats' then
    select n.diwaniya_id into d from public.game_tables g join public.nights n on n.id = g.night_id where g.id = rec.table_id;
  end if;
  if d is not null and exists (select 1 from private.tv_rooms where diwaniya_id = d and revoked_at is null and expires_at > now()) then
    perform private.tv_ping(d);
  end if;
  return null;
exception when others then
  return null;
end $$;

create trigger tv_ping after insert or update or delete on public.score_rounds for each row execute function private.tv_ping_trigger();
create trigger tv_ping after insert or update or delete on public.score_sheets for each row execute function private.tv_ping_trigger();
create trigger tv_ping after insert or update or delete on public.played_games for each row execute function private.tv_ping_trigger();
create trigger tv_ping after insert or update or delete on public.game_tables for each row execute function private.tv_ping_trigger();
create trigger tv_ping after insert or update or delete on public.seats for each row execute function private.tv_ping_trigger();
create trigger tv_ping after update on public.nights for each row execute function private.tv_ping_trigger();

-- A manager may run the TV for an open night of a live (not hidden, not held) diwaniya.
create function private.tv_night(p_night uuid) returns public.nights
language plpgsql stable security definer set search_path = '' as $$
declare n public.nights;
begin
  select * into n from public.nights where id = p_night;
  if n.id is null then raise exception 'night not found' using errcode = 'P0002'; end if;
  if not private.can_manage(n.diwaniya_id) then
    raise exception 'only the diwaniya''s host and co-hosts run the TV' using errcode = '42501';
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------- the host's side (signed in)
create function public.tv_current(p_night uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n public.nights; r private.tv_rooms;
begin
  n := private.tv_night(p_night);
  select * into r from private.tv_rooms
  where night_id = n.id and revoked_at is null and expires_at > now() and n.status = 'open'
  order by created_at desc limit 1;
  if r.id is null then return null; end if;
  return jsonb_build_object('code', r.code, 'expires_at', r.expires_at);
end $$;

create function public.tv_open(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n public.nights; cur jsonb; v_code text; v_bytes bytea; i int; tries int := 0;
  alphabet constant text := 'ACDEFHJKLMNPRTUVWXY3479';
begin
  n := private.tv_night(p_night);
  if n.status <> 'open' then raise exception 'open tonight''s night first' using errcode = '22023'; end if;
  if exists (select 1 from public.diwaniyas x where x.id = n.diwaniya_id and (x.hidden_at is not null or x.held_at is not null)) then
    raise exception 'this diwaniya is under review' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('tv:' || n.id::text));
  cur := public.tv_current(n.id);
  if cur is not null then return cur; end if;
  if (select count(*) from private.tv_rooms where night_id = n.id) >= 6 then
    raise exception 'six TV codes a night at most' using errcode = '54000';
  end if;
  loop
    tries := tries + 1;
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from private.tv_rooms where code = v_code);
    if tries > 20 then raise exception 'could not make a code, try again' using errcode = '40001'; end if;
  end loop;
  insert into private.tv_rooms (night_id, diwaniya_id, code, created_by, expires_at)
  values (n.id, n.diwaniya_id, v_code, auth.uid(), private.night_end(now()));
  return public.tv_current(n.id);
end $$;

create function public.tv_revoke(p_night uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare n public.nights; v_cnt int;
begin
  n := private.tv_night(p_night);
  perform private.tv_ping(n.diwaniya_id, 'ended');
  update private.tv_rooms set revoked_at = now() where night_id = n.id and revoked_at is null;
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $$;

create function public.tv_new_code(p_night uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tv_revoke(p_night);
  return public.tv_open(p_night);
end $$;

-- ---------------------------------------------------------------- Tonight's draw (managers)
create function public.tv_draw(p_night uuid, p_names text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n public.nights; v_names text[]; v_no int; v_tables jsonb := '[]'::jsonb; v_left text[];
  t record; v_seats jsonb; s int; k int := 0; v_total int; v_result jsonb; v_virtual int;
begin
  n := private.tv_night(p_night);
  if n.status <> 'open' then raise exception 'open tonight''s night first' using errcode = '22023'; end if;
  select array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g')) into v_names from unnest(coalesce(p_names, '{}')) x;
  if coalesce(array_length(v_names, 1), 0) < 2 or array_length(v_names, 1) > 36 then
    raise exception 'pick between 2 and 36 names' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_names) x where char_length(x) not between 1 and 40 or x ~ '[[:cntrl:]]') then
    raise exception 'each name is 1 to 40 letters' using errcode = '22023';
  end if;
  if (select count(distinct lower(x)) from unnest(v_names) x) <> array_length(v_names, 1) then
    raise exception 'a name is in the draw twice' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('tvdraw:' || n.id::text));
  select coalesce(max(no), 0) + 1 into v_no from private.tv_draws where night_id = n.id;
  if v_no > 20 then raise exception 'twenty draws a night at most' using errcode = '54000'; end if;

  -- the fair part: a strong random order (gen_random_uuid is v4, from the OS's CSPRNG)
  select array_agg(x order by gen_random_uuid()) into v_names from unnest(v_names) x;
  v_total := array_length(v_names, 1);

  for t in
    select g.game, g.seat_count, g.label from public.game_tables g where g.night_id = n.id order by g.created_at, g.id
  loop
    exit when k >= v_total;
    v_seats := '[]'::jsonb;
    for s in 1..t.seat_count loop
      exit when k >= v_total;
      k := k + 1;
      v_seats := v_seats || jsonb_build_object('seat', s, 'name', v_names[k],
                   'team', case when t.game = 'trix' then s else 2 - s % 2 end);
    end loop;
    v_tables := v_tables || jsonb_build_object('label', t.label, 'game', t.game, 'seats', v_seats);
  end loop;
  -- no tables yet: tables of four (two teams of two), the rest wait
  if jsonb_array_length(v_tables) = 0 then
    v_virtual := greatest(1, v_total / 4);
    for t in select i from generate_series(1, v_virtual) i loop
      v_seats := '[]'::jsonb;
      for s in 1..4 loop
        exit when k >= v_total;
        k := k + 1;
        v_seats := v_seats || jsonb_build_object('seat', s, 'name', v_names[k], 'team', 2 - s % 2);
      end loop;
      v_tables := v_tables || jsonb_build_object('label', '', 'game', null, 'seats', v_seats);
    end loop;
  end if;
  v_left := coalesce(v_names[k + 1:], '{}');
  v_result := jsonb_build_object('no', v_no, 'at', now(), 'tables', v_tables, 'waiting', to_jsonb(v_left));
  insert into private.tv_draws (night_id, no, made_by, result) values (n.id, v_no, auth.uid(), v_result);
  perform private.tv_ping(n.diwaniya_id);
  return v_result;
end $$;

-- ---------------------------------------------------------------- shared scoreboard pieces
-- Season table: every game at the diwaniya (the same numbers as the League screen), top 8.
create function private.tv_season(d uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'played', played, 'wins', wins) order by rk), '[]'::jsonb)
  from (
    select max(r.name) as name, count(*) as played, count(*) filter (where r.won) as wins,
           row_number() over (order by count(*) filter (where r.won) desc,
                                       (count(*) filter (where r.won))::numeric / greatest(count(*), 1) desc,
                                       count(*) asc, max(r.name) asc) as rk
    from public.game_results r join public.played_games g on g.id = r.game_id
    where g.diwaniya_id = d and g.undone_at is null
    group by coalesce(r.user_id::text, 'guest:' || lower(btrim(r.name)))
  ) x where rk <= 8
$$;

-- Monthly crown: most wins since the 1st (Kuwait time); ties share it.
create function private.tv_crown(d uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with w as (
    select max(r.name) as name, count(*) as wins
    from public.game_results r join public.played_games g on g.id = r.game_id
    where g.diwaniya_id = d and g.undone_at is null and r.won
      and g.played_at >= (date_trunc('month', now() at time zone 'Asia/Kuwait') at time zone 'Asia/Kuwait')
    group by coalesce(r.user_id::text, 'guest:' || lower(btrim(r.name)))
  )
  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from w where wins = (select max(wins) from w)
$$;

-- Head-to-head at diwaniya d between two players (keys as in league_standings), on opposite teams.
create function private.tv_h2h(d uuid, ka text, kb text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('games', count(*), 'a_wins', count(*) filter (where a.won), 'b_wins', count(*) filter (where b.won))
  from public.played_games g
  join public.game_results a on a.game_id = g.id and coalesce(a.user_id::text, 'guest:' || lower(btrim(a.name))) = ka
  join public.game_results b on b.game_id = g.id and coalesce(b.user_id::text, 'guest:' || lower(btrim(b.name))) = kb
  where g.diwaniya_id = d and g.undone_at is null and a.team <> b.team
$$;

-- Games of night n: played at its tables, or at the diwaniya while the night ran.
create function private.night_games(n public.nights) returns setof public.played_games
language sql stable security definer set search_path = '' as $$
  select g.* from public.played_games g
  where g.diwaniya_id = n.diwaniya_id and g.undone_at is null
    and (g.table_id in (select id from public.game_tables where night_id = n.id)
         or (g.table_id is null and g.played_at >= least(n.created_at, n.starts_at) - interval '1 hour'
             and g.played_at < private.night_end(least(n.created_at, n.starts_at))))
$$;

-- ---------------------------------------------------------------- the TV (never signs in)
create function public.tv_state(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ip text := private.client_ip(); v_code text; r private.tv_rooms; n public.nights; dw public.diwaniyas;
  v_live jsonb; v_tables jsonb; v_draw jsonb; v_tonight jsonb;
begin
  if (select count(*) from private.tv_misses where ip = v_ip and at > now() - interval '10 minutes') >= 10 then
    raise exception 'too many wrong codes, wait ten minutes' using errcode = '54000';
  end if;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_code ~ '^[ACDEFHJKLMNPRTUVWXY3479]{6}$' then
    select * into r from private.tv_rooms where code = v_code;
  end if;
  if r.id is null then
    delete from private.tv_misses where at < now() - interval '1 day';
    insert into private.tv_misses (ip) values (v_ip);
    return jsonb_build_object('status', 'unknown');
  end if;
  select * into n from public.nights where id = r.night_id;
  select * into dw from public.diwaniyas where id = r.diwaniya_id;
  if r.revoked_at is not null or r.expires_at <= now() or n.status <> 'open'
     or dw.hidden_at is not null or dw.held_at is not null then
    return jsonb_build_object('status', 'ended');
  end if;
  -- reads per room: 60 a minute (the TV polls every few seconds and on each broadcast)
  update private.tv_rooms
     set win_start = case when win_start < now() - interval '1 minute' then now() else win_start end,
         win_calls = case when win_start < now() - interval '1 minute' then 1 else win_calls + 1 end
   where id = r.id
  returning * into r;
  if r.win_calls > 60 then raise exception 'too many reads, slow down' using errcode = '54000'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'label', g.label, 'game', g.game, 'seat_count', g.seat_count, 'need_one', g.need_one,
           'seats', (select coalesce(jsonb_agg(jsonb_build_object('no', s.seat_no,
                       'name', coalesce(s.walk_in_name, p.display_name)) order by s.seat_no), '[]'::jsonb)
                     from public.seats s left join public.profiles p on p.id = s.user_id
                     where s.table_id = g.id))
         order by g.label, g.created_at), '[]'::jsonb)
    into v_tables from public.game_tables g where g.night_id = n.id;

  select coalesce(jsonb_agg(x.j order by x.updated_at desc), '[]'::jsonb) into v_live from (
    select sh.updated_at, jsonb_build_object(
      'table', coalesce((select g.label from public.game_tables g where g.id = sh.table_id), ''),
      'rule_pack', sh.rule_pack, 'teams', sh.teams,
      'players', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(e->>'name', p.display_name), 'team', (e->>'team')::int)
                                  order by (e->>'team')::int, (e->>'seat')::int), '[]'::jsonb)
                  from jsonb_array_elements(sh.players) e left join public.profiles p on p.id = nullif(e->>'user_id', '')::uuid),
      'totals', (select jsonb_agg(coalesce((select sum(rd.points[i]) from public.score_rounds rd
                                            where rd.sheet_id = sh.id and rd.undone_at is null), 0) order by i)
                 from generate_series(1, sh.teams) i),
      'rounds', (select count(*) from public.score_rounds rd where rd.sheet_id = sh.id and rd.undone_at is null),
      'h2h', case when sh.teams = 2 then (
        select private.tv_h2h(sh.diwaniya_id, ka.k, kb.k) || jsonb_build_object('a', ka.name, 'b', kb.name)
        from (select coalesce(nullif(e->>'user_id', ''), 'guest:' || lower(btrim(e->>'name'))) as k,
                     coalesce(e->>'name', p.display_name) as name
              from jsonb_array_elements(sh.players) e left join public.profiles p on p.id = nullif(e->>'user_id', '')::uuid
              where (e->>'team')::int = 1 order by (e->>'seat')::int limit 1) ka,
             (select coalesce(nullif(e->>'user_id', ''), 'guest:' || lower(btrim(e->>'name'))) as k,
                     coalesce(e->>'name', p.display_name) as name
              from jsonb_array_elements(sh.players) e left join public.profiles p on p.id = nullif(e->>'user_id', '')::uuid
              where (e->>'team')::int = 2 order by (e->>'seat')::int limit 1) kb) end) as j
    from public.score_sheets sh
    where sh.diwaniya_id = n.diwaniya_id and sh.status = 'open'
      and (sh.table_id in (select id from public.game_tables where night_id = n.id)
           or (sh.table_id is null and sh.created_at >= least(n.created_at, n.starts_at) - interval '1 hour'))
    order by sh.updated_at desc limit 4) x;

  select result into v_draw from private.tv_draws where night_id = n.id order by no desc limit 1;

  select jsonb_build_object('games', count(*),
           'last', coalesce((select jsonb_agg(z.j order by z.played_at desc) from (
              select g2.played_at, jsonb_build_object('rule_pack', g2.rule_pack, 'at', g2.played_at,
                       'winners', (select coalesce(jsonb_agg(r2.name order by r2.seat), '[]'::jsonb) from public.game_results r2 where r2.game_id = g2.id and r2.won)) as j
              from private.night_games(n) g2 order by g2.played_at desc limit 3) z), '[]'::jsonb))
    into v_tonight from private.night_games(n) g;

  return jsonb_build_object(
    'status', 'live',
    'topic', r.topic,
    'expires_at', r.expires_at,
    'diwaniya', jsonb_build_object('name', dw.name, 'area', dw.area),
    'night', jsonb_build_object('starts_at', n.starts_at),
    'tables', v_tables,
    'live', v_live,
    'season', private.tv_season(dw.id),
    'crown', private.tv_crown(dw.id),
    'draw', v_draw,
    'tonight', v_tonight);
end $$;

-- ---------------------------------------------------------------- Night card (signed in)
-- The diwaniya's latest night (open, or opened in the last 20 hours) for its managers and the
-- people who were at it; null for anyone else. Names and numbers only.
create function public.night_card(p_diwaniya uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n public.nights; dw public.diwaniyas; v_games jsonb; v_top jsonb; v_me jsonb; v_count int; v_players int;
  v_key text := auth.uid()::text;
begin
  if auth.uid() is null or not private.profile_live(auth.uid()) then return null; end if;
  select * into dw from public.diwaniyas where id = p_diwaniya;
  if dw.id is null or dw.hidden_at is not null or dw.held_at is not null then return null; end if;
  select * into n from public.nights where diwaniya_id = dw.id
    and (status = 'open' or created_at > now() - interval '20 hours')
  order by created_at desc limit 1;
  if n.id is null then return null; end if;
  if not (private.can_manage(dw.id) or private.attended(n.id, auth.uid())) then return null; end if;

  select count(*) into v_count from private.night_games(n);
  select count(distinct coalesce(r.user_id::text, 'guest:' || lower(btrim(r.name)))) into v_players
    from private.night_games(n) g join public.game_results r on r.game_id = g.id;
  select coalesce(jsonb_agg(z.j order by z.played_at), '[]'::jsonb) into v_games from (
    select g.played_at, jsonb_build_object('rule_pack', g.rule_pack, 'at', g.played_at,
      'winners', (select coalesce(jsonb_agg(r.name order by r.seat), '[]'::jsonb) from public.game_results r where r.game_id = g.id and r.won),
      'losers', (select coalesce(jsonb_agg(r.name order by r.seat), '[]'::jsonb) from public.game_results r where r.game_id = g.id and not r.won)) as j
    from private.night_games(n) g order by g.played_at desc limit 8) z;
  with w as (
    select max(r.name) as name, count(*) filter (where r.won) as wins, count(*) as played
    from private.night_games(n) g join public.game_results r on r.game_id = g.id
    group by coalesce(r.user_id::text, 'guest:' || lower(btrim(r.name))))
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'wins', wins, 'played', played) order by name), '[]'::jsonb)
    into v_top from w where wins > 0 and wins = (select max(wins) from w);
  select case when count(*) > 0 then jsonb_build_object('played', count(*), 'wins', count(*) filter (where r.won)) end
    into v_me from private.night_games(n) g join public.game_results r on r.game_id = g.id and r.user_id::text = v_key;

  return jsonb_build_object(
    'name', dw.name, 'area', dw.area, 'starts_at', n.starts_at, 'open', n.status = 'open',
    'games', v_count, 'players', v_players, 'list', v_games, 'top', v_top, 'me', v_me,
    'crown', private.tv_crown(dw.id), 'host', private.can_manage(dw.id));
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function private.client_ip(), private.night_end(timestamptz), private.attended(uuid, uuid),
  private.tv_ping(uuid, text), private.tv_ping_trigger(), private.tv_night(uuid), private.tv_season(uuid),
  private.tv_crown(uuid), private.tv_h2h(uuid, text, text), private.night_games(public.nights)
  from public, anon, authenticated;
revoke all on function public.tv_current(uuid), public.tv_open(uuid), public.tv_revoke(uuid), public.tv_new_code(uuid),
  public.tv_draw(uuid, text[]), public.night_card(uuid), public.tv_state(text) from public, anon, authenticated;
grant execute on function public.tv_current(uuid), public.tv_open(uuid), public.tv_revoke(uuid), public.tv_new_code(uuid),
  public.tv_draw(uuid, text[]), public.night_card(uuid) to authenticated;
-- The one door the TV uses.
grant execute on function public.tv_state(text) to anon, authenticated;
