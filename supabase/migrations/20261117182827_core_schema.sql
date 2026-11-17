-- Diwaniya Tonight, core schema v1 (ADC-TSK-36, slice 2).
-- Every table has RLS on. anon gets nothing. Authenticated users get only the
-- columns and rows they need; every state change in the core loop (request,
-- approve, check in, need one, scoring) goes through a SECURITY DEFINER RPC
-- with search_path = '' so the rules live in one place.
-- Open rulings (ADC-RES-49 s.11): A sign-in method (schema is method-neutral),
-- B minimum age (private.min_age, 18 until Ali rules), C audience (column kept,
-- default 'all'), D moderation (reports are write-only for now).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  area text not null check (char_length(area) between 1 and 60),
  games text[] not null default '{}' check (games <@ array['kout','baloot','tarneeb','trix']::text[]),
  created_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  terms_accepted_at timestamptz not null,
  lang text not null default 'ar' check (lang in ('ar','en')),
  numerals text not null default 'auto' check (numerals in ('auto','arab','latn')),
  theme text not null default 'auto' check (theme in ('auto','night','day')),
  ping_games text[] not null default '{}' check (ping_games <@ array['kout','baloot','tarneeb','trix']::text[]),
  ping_areas text[] not null default '{}' check (cardinality(ping_areas) <= 10),
  quiet_start time,
  quiet_end time,
  ping_daily_cap int not null default 3 check (ping_daily_cap between 0 and 3)
);

create table public.diwaniyas (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  area text not null check (char_length(area) between 1 and 60),
  about text not null default '' check (char_length(about) <= 500),
  rules text not null default '' check (char_length(rules) <= 1000),
  visibility text not null default 'public' check (visibility in ('public','followers')),
  approval text not null default 'host' check (approval in ('host','regulars_auto')),
  audience text not null default 'all' check (audience in ('all','men','women','families')),
  guest_cap int not null default 4 check (guest_cap between 0 and 30),
  pin_unlock_minutes int not null default 60 check (pin_unlock_minutes between 0 and 720),
  usual_slot text not null default '' check (char_length(usual_slot) <= 40),
  created_at timestamptz not null default now()
);
create index on public.diwaniyas (host_id);

create table public.cohosts (
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (diwaniya_id, user_id)
);
create index on public.cohosts (user_id);

create table public.regulars (
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (diwaniya_id, user_id)
);
create index on public.regulars (user_id);

create table public.follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, diwaniya_id)
);
create index on public.follows (diwaniya_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index on public.blocks (blocked_id);

-- The exact location lives apart from the diwaniya row, so area-only is the
-- default and the pin is readable only by managers and approved guests.
create table public.diwaniya_pins (
  diwaniya_id uuid primary key references public.diwaniyas(id) on delete cascade,
  lat numeric(8,5) not null check (lat between -90 and 90),
  lng numeric(8,5) not null check (lng between -180 and 180),
  directions text not null default '' check (char_length(directions) <= 300)
);

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  starts_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  pin_unlock_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index nights_one_open on public.nights (diwaniya_id) where status = 'open';

create table public.game_tables (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  game text not null check (game in ('kout','baloot','tarneeb','trix')),
  seat_count int not null,
  label text not null default '' check (char_length(label) <= 30),
  queue_mode text not null default 'rotation' check (queue_mode in ('rotation','winner_stays')),
  need_one boolean not null default false,
  need_one_at timestamptz,
  created_at timestamptz not null default now(),
  check ((game = 'kout' and seat_count in (4, 6)) or (game <> 'kout' and seat_count = 4))
);
create index on public.game_tables (night_id);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.game_tables(id) on delete cascade,
  seat_no smallint not null check (seat_no between 1 and 6),
  user_id uuid references public.profiles(id) on delete cascade,
  walk_in_name text check (char_length(walk_in_name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (table_id, seat_no),
  unique (table_id, user_id),
  check (num_nonnulls(user_id, walk_in_name) = 1)
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  table_id uuid references public.game_tables(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  eta_minutes int not null default 0 check (eta_minutes between 0 and 240),
  note text not null default '' check (char_length(note) <= 200),
  status text not null default 'pending'
    check (status in ('pending','approved','declined','cancelled','arrived','no_show')),
  auto_approved boolean not null default false,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);
create unique index requests_one_active on public.requests (night_id, user_id)
  where status in ('pending','approved','arrived');
create index on public.requests (user_id);

create table public.table_queue (
  table_id uuid not null references public.game_tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

create table public.inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('request','approved','declined','auto_approved','cancelled','need_one','no_show')),
  diwaniya_id uuid references public.diwaniyas(id) on delete cascade,
  night_id uuid references public.nights(id) on delete cascade,
  request_id uuid references public.requests(id) on delete cascade,
  table_id uuid references public.game_tables(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on public.inbox (user_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_user uuid references public.profiles(id) on delete set null,
  target_diwaniya uuid references public.diwaniyas(id) on delete set null,
  reason text not null check (reason in ('safety','harassment','no_show','fake','other')),
  details text not null default '' check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  check (num_nonnulls(target_user, target_diwaniya) >= 1)
);

create table public.played_games (
  id uuid primary key default gen_random_uuid(),
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  table_id uuid references public.game_tables(id) on delete set null,
  rule_pack text not null check (rule_pack in ('kout_bo6','kout_bo4','baloot','tarneeb_31','tarneeb_41','tarneeb_61','trix')),
  recorded_by uuid references public.profiles(id) on delete set null,
  played_at timestamptz not null default now(),
  undone_at timestamptz
);
create index on public.played_games (diwaniya_id, played_at desc);

create table public.game_results (
  game_id uuid not null references public.played_games(id) on delete cascade,
  seat smallint not null check (seat between 1 and 6),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  team smallint not null check (team between 1 and 4),
  points int not null check (points between -1000 and 1000),
  won boolean not null,
  primary key (game_id, seat)
);
create index on public.game_results (user_id);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can look across tables without recursion.
-- The private schema is not exposed through the API.

create function private.min_age() returns int
language sql immutable set search_path = '' as $$ select 18 $$;  -- ruling B

create function private.blocked_with(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid()))
$$;

create function private.is_host(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diwaniyas x where x.id = d and x.host_id = auth.uid())
$$;

create function private.can_manage(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diwaniyas x where x.id = d and x.host_id = auth.uid())
      or exists (select 1 from public.cohosts c where c.diwaniya_id = d and c.user_id = auth.uid())
$$;

create function private.can_see_diwaniya(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diwaniyas x where x.id = d
                 and (private.can_manage(d) or not private.blocked_with(x.host_id)))
$$;

-- Nights (and their tables, seats and queues) of a followers-only diwaniya
-- are seen by followers, regulars and managers only.
create function private.can_see_nights(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage(d) or exists (
    select 1 from public.diwaniyas x where x.id = d
      and not private.blocked_with(x.host_id)
      and (x.visibility = 'public'
           or exists (select 1 from public.follows f where f.diwaniya_id = d and f.user_id = auth.uid())
           or exists (select 1 from public.regulars r where r.diwaniya_id = d and r.user_id = auth.uid())))
$$;

create function private.night_diwaniya(n uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select diwaniya_id from public.nights where id = n
$$;

create function private.table_diwaniya(t uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select n.diwaniya_id from public.game_tables g join public.nights n on n.id = g.night_id where g.id = t
$$;

-- Approved guests see the pin once tonight's unlock time has passed.
create function private.pin_unlocked(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.requests r join public.nights n on n.id = r.night_id
    where n.diwaniya_id = d and r.user_id = auth.uid()
      and r.status in ('approved','arrived') and n.status = 'open'
      and now() >= n.pin_unlock_at)
$$;

-- Members may score games: managers, regulars, anyone ever approved there.
create function private.is_member(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage(d)
      or exists (select 1 from public.regulars r where r.diwaniya_id = d and r.user_id = auth.uid())
      or exists (select 1 from public.requests q join public.nights n on n.id = q.night_id
                 where n.diwaniya_id = d and q.user_id = auth.uid() and q.status in ('approved','arrived'))
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------- triggers

create function private.nights_set_unlock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select new.starts_at - make_interval(mins => d.pin_unlock_minutes)
    into new.pin_unlock_at from public.diwaniyas d where d.id = new.diwaniya_id;
  return new;
end $$;
create trigger nights_set_unlock before insert or update of starts_at on public.nights
  for each row execute function private.nights_set_unlock();

create function private.seats_check_no() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.seat_no > (select seat_count from public.game_tables where id = new.table_id) then
    raise exception 'seat % is past this table''s seats', new.seat_no using errcode = '22023';
  end if;
  return new;
end $$;
create trigger seats_check_no before insert or update on public.seats
  for each row execute function private.seats_check_no();

-- Blocking someone drops their follow and their open requests at your
-- diwaniyas, both ways, and takes them out of your seats and queues.
create function private.blocks_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.requests r set status = 'declined', decided_at = now(), decided_by = new.blocker_id
   where r.status in ('pending','approved')
     and ((r.user_id = new.blocked_id and r.night_id in (select n.id from public.nights n join public.diwaniyas d on d.id = n.diwaniya_id where d.host_id = new.blocker_id))
       or (r.user_id = new.blocker_id and r.night_id in (select n.id from public.nights n join public.diwaniyas d on d.id = n.diwaniya_id where d.host_id = new.blocked_id)));
  delete from public.follows f
   where (f.user_id = new.blocked_id and f.diwaniya_id in (select id from public.diwaniyas where host_id = new.blocker_id))
      or (f.user_id = new.blocker_id and f.diwaniya_id in (select id from public.diwaniyas where host_id = new.blocked_id));
  delete from public.table_queue q
   where q.user_id = new.blocked_id
     and private.table_diwaniya(q.table_id) in (select id from public.diwaniyas where host_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_cleanup after insert on public.blocks
  for each row execute function private.blocks_cleanup();

revoke all on function private.nights_set_unlock(), private.seats_check_no(), private.blocks_cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.diwaniyas enable row level security;
alter table public.cohosts enable row level security;
alter table public.regulars enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.diwaniya_pins enable row level security;
alter table public.nights enable row level security;
alter table public.game_tables enable row level security;
alter table public.seats enable row level security;
alter table public.requests enable row level security;
alter table public.table_queue enable row level security;
alter table public.inbox enable row level security;
alter table public.reports enable row level security;
alter table public.played_games enable row level security;
alter table public.game_results enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or not private.blocked_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy private_read on public.profile_private for select to authenticated using (user_id = auth.uid());
create policy private_update on public.profile_private for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Uses the row's own host_id: a helper that re-reads the table cannot see a
-- row inserted by the same statement (insert ... returning).
create policy diwaniyas_read on public.diwaniyas for select to authenticated
  using (host_id = auth.uid() or not private.blocked_with(host_id) or private.can_manage(id));
create policy diwaniyas_insert on public.diwaniyas for insert to authenticated
  with check (host_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid()));
create policy diwaniyas_update on public.diwaniyas for update to authenticated
  using (private.is_host(id)) with check (host_id = auth.uid());
create policy diwaniyas_delete on public.diwaniyas for delete to authenticated using (private.is_host(id));

create policy cohosts_read on public.cohosts for select to authenticated
  using (user_id = auth.uid() or private.can_manage(diwaniya_id));
create policy cohosts_insert on public.cohosts for insert to authenticated
  with check (private.is_host(diwaniya_id) and user_id <> auth.uid());
create policy cohosts_delete on public.cohosts for delete to authenticated
  using (private.is_host(diwaniya_id) or user_id = auth.uid());

create policy regulars_read on public.regulars for select to authenticated
  using (user_id = auth.uid() or private.can_manage(diwaniya_id));
create policy regulars_insert on public.regulars for insert to authenticated
  with check (private.can_manage(diwaniya_id) and not private.blocked_with(user_id));
create policy regulars_delete on public.regulars for delete to authenticated
  using (private.can_manage(diwaniya_id) or user_id = auth.uid());

create policy follows_read on public.follows for select to authenticated
  using (user_id = auth.uid() or private.can_manage(diwaniya_id));
create policy follows_insert on public.follows for insert to authenticated
  with check (user_id = auth.uid() and private.can_see_diwaniya(diwaniya_id) and not private.can_manage(diwaniya_id));
create policy follows_delete on public.follows for delete to authenticated using (user_id = auth.uid());

create policy blocks_read on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create policy pins_read on public.diwaniya_pins for select to authenticated
  using (private.can_manage(diwaniya_id) or private.pin_unlocked(diwaniya_id));
create policy pins_insert on public.diwaniya_pins for insert to authenticated with check (private.is_host(diwaniya_id));
create policy pins_update on public.diwaniya_pins for update to authenticated
  using (private.is_host(diwaniya_id)) with check (private.is_host(diwaniya_id));
create policy pins_delete on public.diwaniya_pins for delete to authenticated using (private.is_host(diwaniya_id));

create policy nights_read on public.nights for select to authenticated using (private.can_see_nights(diwaniya_id));
create policy nights_insert on public.nights for insert to authenticated with check (private.can_manage(diwaniya_id));
create policy nights_update on public.nights for update to authenticated
  using (private.can_manage(diwaniya_id)) with check (private.can_manage(diwaniya_id));

create policy tables_read on public.game_tables for select to authenticated
  using (private.can_see_nights(private.night_diwaniya(night_id)));
create policy tables_insert on public.game_tables for insert to authenticated
  with check (private.can_manage(private.night_diwaniya(night_id)));
create policy tables_update on public.game_tables for update to authenticated
  using (private.can_manage(private.night_diwaniya(night_id)))
  with check (private.can_manage(private.night_diwaniya(night_id)));
create policy tables_delete on public.game_tables for delete to authenticated
  using (private.can_manage(private.night_diwaniya(night_id)));

create policy seats_read on public.seats for select to authenticated
  using (private.can_see_nights(private.table_diwaniya(table_id)));
create policy seats_insert on public.seats for insert to authenticated
  with check (private.can_manage(private.table_diwaniya(table_id)));
create policy seats_delete on public.seats for delete to authenticated
  using (user_id = auth.uid() or private.can_manage(private.table_diwaniya(table_id)));

create policy requests_read on public.requests for select to authenticated
  using (user_id = auth.uid() or private.can_manage(private.night_diwaniya(night_id)));

create policy queue_read on public.table_queue for select to authenticated
  using (private.can_see_nights(private.table_diwaniya(table_id)));
create policy queue_insert on public.table_queue for insert to authenticated
  with check (user_id = auth.uid() and private.can_see_nights(private.table_diwaniya(table_id))
              and private.is_member(private.table_diwaniya(table_id)));
create policy queue_delete on public.table_queue for delete to authenticated
  using (user_id = auth.uid() or private.can_manage(private.table_diwaniya(table_id)));

create policy inbox_read on public.inbox for select to authenticated using (user_id = auth.uid());
create policy inbox_update on public.inbox for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());

create policy games_read on public.played_games for select to authenticated using (private.can_see_diwaniya(diwaniya_id));
create policy results_read on public.game_results for select to authenticated
  using (exists (select 1 from public.played_games g where g.id = game_id));

-- ---------------------------------------------------------------- grants

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, area, games) on public.profiles to authenticated;
grant select on public.profile_private to authenticated;
grant update (lang, numerals, theme, ping_games, ping_areas, quiet_start, quiet_end, ping_daily_cap)
  on public.profile_private to authenticated;
grant select, delete on public.diwaniyas to authenticated;
grant insert (host_id, name, area, about, rules, visibility, approval, audience, guest_cap, pin_unlock_minutes, usual_slot)
  on public.diwaniyas to authenticated;
grant update (name, area, about, rules, visibility, approval, audience, guest_cap, pin_unlock_minutes, usual_slot)
  on public.diwaniyas to authenticated;
grant select, insert, delete on public.cohosts, public.regulars, public.follows, public.blocks to authenticated;
grant select, insert, update, delete on public.diwaniya_pins to authenticated;
grant select on public.nights to authenticated;
grant insert (diwaniya_id, starts_at) on public.nights to authenticated;
grant update (starts_at, status) on public.nights to authenticated;
grant select, delete on public.game_tables to authenticated;
grant insert (night_id, game, seat_count, label, queue_mode) on public.game_tables to authenticated;
grant update (label, queue_mode) on public.game_tables to authenticated;
grant select, delete on public.seats to authenticated;
grant insert (table_id, seat_no, user_id, walk_in_name) on public.seats to authenticated;
grant select on public.requests to authenticated;
grant select, delete on public.table_queue to authenticated;
grant insert (table_id, user_id) on public.table_queue to authenticated;
grant select on public.inbox to authenticated;
grant update (read_at) on public.inbox to authenticated;
grant select on public.reports to authenticated;
grant insert (target_user, target_diwaniya, reason, details) on public.reports to authenticated;
grant select on public.played_games, public.game_results to authenticated;

-- ---------------------------------------------------------------- RPCs

create function public.complete_profile(p_name text, p_area text, p_birth_date date, p_accept_terms boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
        v_area text := btrim(regexp_replace(coalesce(p_area, ''), '[[:cntrl:]]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if v_name = '' or v_area = '' then raise exception 'name and area are required' using errcode = '22023'; end if;
  if p_accept_terms is not true then raise exception 'accept the terms first' using errcode = '22023'; end if;
  if p_birth_date is null or p_birth_date > (current_date - make_interval(years => private.min_age()))::date
     or p_birth_date < date '1900-01-01' then
    raise exception 'too young for Diwaniya Tonight' using errcode = '22023';
  end if;
  insert into public.profile_private (user_id, birth_date, terms_accepted_at)
    values (auth.uid(), p_birth_date, now())
    on conflict (user_id) do nothing;  -- birth date is set once
  insert into public.profiles (id, display_name, area) values (auth.uid(), left(v_name, 40), left(v_area, 60))
    on conflict (id) do update set display_name = excluded.display_name, area = excluded.area;
end $$;

create function private.notify_managers(d uuid, k text, n uuid, r uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.inbox (user_id, kind, diwaniya_id, night_id, request_id)
  select x.host_id, k, d, n, r from public.diwaniyas x where x.id = d
  union
  select c.user_id, k, d, n, r from public.cohosts c where c.diwaniya_id = d
$$;
revoke all on function private.notify_managers(uuid, text, uuid, uuid) from public, anon, authenticated;

create function public.request_seat(p_night uuid, p_table uuid, p_eta_minutes int, p_note text, p_accept_rules boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_d uuid; v_night public.nights; v_dw public.diwaniyas; v_auto boolean; v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'finish your profile first' using errcode = '42501';
  end if;
  select * into v_night from public.nights where id = p_night;
  if v_night.id is null or not private.can_see_nights(v_night.diwaniya_id) then
    raise exception 'night not found' using errcode = 'P0002';
  end if;
  v_d := v_night.diwaniya_id;
  select * into v_dw from public.diwaniyas where id = v_d;
  if v_night.status <> 'open' then raise exception 'this night is closed' using errcode = '22023'; end if;
  if private.can_manage(v_d) then raise exception 'you run this diwaniya' using errcode = '22023'; end if;
  if p_accept_rules is not true then raise exception 'accept the house rules first' using errcode = '22023'; end if;
  if p_table is not null and not exists (select 1 from public.game_tables where id = p_table and night_id = p_night) then
    raise exception 'table not found' using errcode = 'P0002';
  end if;
  v_auto := v_dw.approval = 'regulars_auto'
            and exists (select 1 from public.regulars where diwaniya_id = v_d and user_id = auth.uid());
  insert into public.requests (night_id, table_id, user_id, eta_minutes, note, status, auto_approved, decided_at)
    values (p_night, p_table, auth.uid(), least(greatest(coalesce(p_eta_minutes, 0), 0), 240),
            left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', '', 'g')), 200),
            case when v_auto then 'approved' else 'pending' end, v_auto,
            case when v_auto then now() end)
    returning id into v_id;
  perform private.notify_managers(v_d, case when v_auto then 'auto_approved' else 'request' end, p_night, v_id);
  return v_id;
end $$;

create function public.decide_request(p_request uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_r public.requests; v_d uuid; v_cap int; v_taken int; v_status text;
begin
  select * into v_r from public.requests where id = p_request for update;
  v_d := private.night_diwaniya(v_r.night_id);
  if v_r.id is null or not private.can_manage(v_d) then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_r.status <> 'pending' then raise exception 'already decided' using errcode = '22023'; end if;
  if p_approve then
    select guest_cap into v_cap from public.diwaniyas where id = v_d;
    select count(*) into v_taken from public.requests q
      where q.night_id = v_r.night_id and q.status in ('approved','arrived') and not q.auto_approved;
    if v_taken >= v_cap then raise exception 'guest cap reached' using errcode = '23514'; end if;
  end if;
  v_status := case when p_approve then 'approved' else 'declined' end;
  update public.requests set status = v_status, decided_at = now(), decided_by = auth.uid() where id = p_request;
  insert into public.inbox (user_id, kind, diwaniya_id, night_id, request_id)
    values (v_r.user_id, v_status, v_d, v_r.night_id, p_request);
  return v_status;
end $$;

create function public.cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.requests;
begin
  select * into v_r from public.requests where id = p_request and user_id = auth.uid() for update;
  if v_r.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_r.status not in ('pending','approved') then raise exception 'cannot cancel now' using errcode = '22023'; end if;
  update public.requests set status = 'cancelled', decided_at = now() where id = p_request;
  delete from public.seats s using public.game_tables g
   where s.table_id = g.id and g.night_id = v_r.night_id and s.user_id = auth.uid();
  perform private.notify_managers(private.night_diwaniya(v_r.night_id), 'cancelled', v_r.night_id, p_request);
end $$;

create function public.mark_request(p_request uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.requests; v_d uuid;
begin
  select * into v_r from public.requests where id = p_request for update;
  v_d := private.night_diwaniya(v_r.night_id);
  if v_r.id is null or not private.can_manage(v_d) then raise exception 'request not found' using errcode = 'P0002'; end if;
  if p_status not in ('arrived','no_show') or v_r.status not in ('approved','arrived','no_show') then
    raise exception 'cannot mark this request' using errcode = '22023';
  end if;
  if p_status = 'no_show' and (select starts_at from public.nights where id = v_r.night_id) > now() then
    raise exception 'too early for a no-show' using errcode = '22023';
  end if;
  update public.requests set status = p_status, decided_at = now(), decided_by = auth.uid() where id = p_request;
  if p_status = 'no_show' then
    insert into public.inbox (user_id, kind, diwaniya_id, night_id, request_id)
      values (v_r.user_id, 'no_show', v_d, v_r.night_id, p_request);
  end if;
end $$;

create function public.check_in(p_table uuid, p_seat_no int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_night uuid; v_r public.requests; v_id uuid;
begin
  select night_id into v_night from public.game_tables where id = p_table;
  if v_night is null or not private.can_see_nights(private.night_diwaniya(v_night)) then
    raise exception 'table not found' using errcode = 'P0002';
  end if;
  select * into v_r from public.requests
   where night_id = v_night and user_id = auth.uid() and status in ('approved','arrived') for update;
  if v_r.id is null and not private.can_manage(private.night_diwaniya(v_night)) then
    raise exception 'your seat is not approved yet' using errcode = '42501';
  end if;
  insert into public.seats (table_id, seat_no, user_id) values (p_table, p_seat_no, auth.uid()) returning id into v_id;
  if v_r.id is not null then update public.requests set status = 'arrived' where id = v_r.id; end if;
  delete from public.table_queue where table_id = p_table and user_id = auth.uid();
  return v_id;
end $$;

-- 'Need one': pings followers and regulars who play that game, are not
-- blocked either way, have no active request tonight and are under their
-- daily cap. Returns how many inbox items were written.
create function public.set_need_one(p_table uuid, p_on boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_t public.game_tables; v_d uuid; v_host uuid; v_n int := 0;
begin
  select * into v_t from public.game_tables where id = p_table for update;
  v_d := private.table_diwaniya(p_table);
  if v_t.id is null or not private.can_manage(v_d) then raise exception 'table not found' using errcode = 'P0002'; end if;
  update public.game_tables set need_one = coalesce(p_on, false), need_one_at = case when p_on then now() end where id = p_table;
  if p_on is not true then return 0; end if;
  select host_id into v_host from public.diwaniyas where id = v_d;
  insert into public.inbox (user_id, kind, diwaniya_id, night_id, table_id)
  select a.user_id, 'need_one', v_d, v_t.night_id, p_table
  from (select user_id from public.follows where diwaniya_id = v_d
        union select user_id from public.regulars where diwaniya_id = v_d) a
  join public.profile_private pp on pp.user_id = a.user_id
  where a.user_id <> v_host
    and not exists (select 1 from public.cohosts c where c.diwaniya_id = v_d and c.user_id = a.user_id)
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = v_host and b.blocked_id = a.user_id) or (b.blocker_id = a.user_id and b.blocked_id = v_host))
    and (cardinality(pp.ping_games) = 0 or v_t.game = any (pp.ping_games))
    and not exists (select 1 from public.requests q where q.night_id = v_t.night_id and q.user_id = a.user_id
                    and q.status in ('pending','approved','arrived'))
    and (select count(*) from public.inbox i where i.user_id = a.user_id and i.kind = 'need_one'
         and i.created_at > now() - interval '24 hours') < pp.ping_daily_cap;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- p_results: [{"seat":1,"user_id":"..."|null,"name":"..","team":1,"points":152,"won":true}, ...]
create function public.record_game(p_diwaniya uuid, p_rule_pack text, p_table uuid, p_results jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int;
begin
  if auth.uid() is null or not private.is_member(p_diwaniya) then
    raise exception 'only members of this diwaniya can score' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'results must be a list' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_results);
  if v_n < 2 or v_n > 6 then raise exception 'a game has 2 to 6 players' using errcode = '22023'; end if;
  if p_table is not null and private.table_diwaniya(p_table) is distinct from p_diwaniya then
    raise exception 'table not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_results) e
             where nullif(e->>'user_id', '') is not null
               and not exists (select 1 from public.profiles p where p.id = (e->>'user_id')::uuid)) then
    raise exception 'unknown player' using errcode = '22023';
  end if;
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

create function public.undo_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_g public.played_games;
begin
  select * into v_g from public.played_games where id = p_game for update;
  if v_g.id is null or not (v_g.recorded_by = auth.uid() or private.can_manage(v_g.diwaniya_id)) then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  update public.played_games set undone_at = now() where id = p_game and undone_at is null;
end $$;

create function public.player_stats(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if private.blocked_with(p_user) or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'nights_shown', (select count(*) from public.requests where user_id = p_user and status = 'arrived'),
    'no_shows', (select count(*) from public.requests where user_id = p_user and status = 'no_show'),
    'games', (select count(*) from public.game_results r join public.played_games g on g.id = r.game_id
              where r.user_id = p_user and g.undone_at is null),
    'wins', (select count(*) from public.game_results r join public.played_games g on g.id = r.game_id
             where r.user_id = p_user and r.won and g.undone_at is null));
end $$;

-- Season table, read with the caller's own rights (RLS applies).
create view public.league_standings with (security_invoker = true) as
  select g.diwaniya_id, r.user_id, max(r.name) as name,
         count(*) as played, count(*) filter (where r.won) as wins,
         min(g.played_at) as first_played, max(g.played_at) as last_played
  from public.game_results r join public.played_games g on g.id = r.game_id
  where g.undone_at is null and r.user_id is not null
  group by g.diwaniya_id, r.user_id;
revoke all on public.league_standings from anon, authenticated;
grant select on public.league_standings to authenticated;

revoke all on function public.complete_profile(text, text, date, boolean),
  public.request_seat(uuid, uuid, int, text, boolean), public.decide_request(uuid, boolean),
  public.cancel_request(uuid), public.mark_request(uuid, text), public.check_in(uuid, int),
  public.set_need_one(uuid, boolean), public.record_game(uuid, text, uuid, jsonb),
  public.undo_game(uuid), public.player_stats(uuid) from public, anon;
grant execute on function public.complete_profile(text, text, date, boolean),
  public.request_seat(uuid, uuid, int, text, boolean), public.decide_request(uuid, boolean),
  public.cancel_request(uuid), public.mark_request(uuid, text), public.check_in(uuid, int),
  public.set_need_one(uuid, boolean), public.record_game(uuid, text, uuid, jsonb),
  public.undo_game(uuid), public.player_stats(uuid) to authenticated;

-- Live seats, requests, needs and inbox (Realtime honours RLS).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.seats, public.game_tables, public.requests, public.inbox;
  end if;
end $$;
