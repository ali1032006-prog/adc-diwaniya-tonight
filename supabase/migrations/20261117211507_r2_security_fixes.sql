-- Diwaniya Tonight, review round 1/3 fixes (ADC-TSK-36, Jayce ADC-LOG-738).
--   ADC-SEC-16  request/cancel ping flood: per-night and per-10-minute request limits, a cancelled
--               pending request pings nobody, and repeated pushes of the same kind are coalesced.
--   ADC-SEC-17  moderation that sticks: a hide is remembered against the Google identity (survives
--               delete + sign in again), a held account can't delete itself out of review, and a
--               hidden or held account can't act anywhere (manage, score, report, follow, queue, ping).
--   ADC-SEC-18  nobody is attached to a diwaniya without consent: co-hosts are invited and accept,
--               blocks remove co-host rows and seats, managers seat only approved guests, and games
--               name only people who were really there.
--   ADC-SEC-19  reporters can't read who reviewed their report or the admin's note (column grants).
--   ADC-SEC-20  only reporters with a real link to the target count toward a hold, and the admins
--               get an inbox item (and push) the moment a hold starts.

-- ---------------------------------------------------------------- helpers

-- ADC-SEC-18 (1): a co-host row is an invitation until the invitee accepts.
alter table public.cohosts add column invited_at timestamptz not null default now(),
                           add column accepted_at timestamptz;
-- Co-hosts that exist now were set up by the database owner (mock pilot seed); keep them working.
update public.cohosts set accepted_at = coalesce(accepted_at, now());


-- Is either of a and b blocking the other? (blocked_with() only knows the caller.)
create function private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks x
                 where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a))
$$;

-- Does u run d (host or a co-host who accepted)? Independent of the caller.
create function private.manages(u uuid, d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diwaniyas x where x.id = d and x.host_id = u)
      or exists (select 1 from public.cohosts c where c.diwaniya_id = d and c.user_id = u and c.accepted_at is not null)
$$;

-- ---------------------------------------------------------------- ADC-SEC-18 (1): co-hosts by invitation

-- ADC-SEC-17 (3): a hidden or held account manages nothing; ADC-SEC-18: an invite is not a role.
create or replace function private.can_manage(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.profile_live(auth.uid()) and private.manages(auth.uid(), d)
$$;

drop policy cohosts_insert on public.cohosts;
create policy cohosts_insert on public.cohosts for insert to authenticated
  with check (private.is_host(diwaniya_id) and private.profile_live(auth.uid())
              and user_id <> auth.uid() and private.profile_live(user_id)
              and not private.blocked_with(user_id));
revoke insert on public.cohosts from authenticated;
grant insert (diwaniya_id, user_id) on public.cohosts to authenticated;  -- never accepted_at

create function public.accept_cohost(p_diwaniya uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_host uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not private.profile_live(auth.uid()) then raise exception 'your account is under review' using errcode = '42501'; end if;
  select host_id into v_host from public.diwaniyas where id = p_diwaniya;
  if v_host is null or private.blocked_between(v_host, auth.uid()) then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  update public.cohosts set accepted_at = now()
   where diwaniya_id = p_diwaniya and user_id = auth.uid() and accepted_at is null;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
end $$;

alter table public.inbox drop constraint inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('request','approved','declined','auto_approved','cancelled','need_one','no_show',
                  'announcement','cohost_invite','held'));

-- The invitee hears about it once a day per diwaniya at most (invite, remove, invite again
-- must not become a ping loop).
create function private.cohosts_invited() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.accepted_at is null and not exists (
       select 1 from public.inbox i where i.user_id = new.user_id and i.kind = 'cohost_invite'
          and i.diwaniya_id = new.diwaniya_id and i.created_at > now() - interval '24 hours') then
    insert into public.inbox (user_id, kind, diwaniya_id) values (new.user_id, 'cohost_invite', new.diwaniya_id);
  end if;
  return new;
end $$;
create trigger cohosts_invited after insert on public.cohosts
  for each row execute function private.cohosts_invited();

-- Managers' inbox goes to the host and to co-hosts who accepted, never to an open invite.
create or replace function private.notify_managers(d uuid, k text, n uuid, r uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.inbox (user_id, kind, diwaniya_id, night_id, request_id)
  select x.host_id, k, d, n, r from public.diwaniyas x where x.id = d
  union
  select c.user_id, k, d, n, r from public.cohosts c where c.diwaniya_id = d and c.accepted_at is not null
$$;

-- Blocking also ends a co-host role and takes the person out of the other's seats, both ways.
create or replace function private.blocks_cleanup() returns trigger
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
  delete from public.cohosts c
   where (c.user_id = new.blocked_id and c.diwaniya_id in (select id from public.diwaniyas where host_id = new.blocker_id))
      or (c.user_id = new.blocker_id and c.diwaniya_id in (select id from public.diwaniyas where host_id = new.blocked_id));
  delete from public.seats s
   where (s.user_id = new.blocked_id
          and private.table_diwaniya(s.table_id) in (select id from public.diwaniyas where host_id = new.blocker_id))
      or (s.user_id = new.blocker_id
          and private.table_diwaniya(s.table_id) in (select id from public.diwaniyas where host_id = new.blocked_id));
  return new;
end $$;

-- ---------------------------------------------------------------- ADC-SEC-18 (2): who a manager may seat

-- A manager seats a walk-in by name, himself, or a guest approved for that night who is live and
-- not blocked either way with the host or with him.
create function private.seat_ok(t uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select u = auth.uid() or (
    private.profile_live(u)
    and not private.blocked_with(u)
    and not private.blocked_between(u, (select d.host_id from public.diwaniyas d where d.id = private.table_diwaniya(t)))
    and exists (select 1 from public.requests q join public.game_tables g on g.night_id = q.night_id
                where g.id = t and q.user_id = u and q.status in ('approved','arrived')))
$$;

drop policy seats_insert on public.seats;
create policy seats_insert on public.seats for insert to authenticated
  with check (private.can_manage(private.table_diwaniya(table_id))
              and (user_id is null or private.seat_ok(table_id, user_id)));

-- ---------------------------------------------------------------- ADC-SEC-18 (3) + SEC-17: scoring

create or replace function public.record_game(p_diwaniya uuid, p_rule_pack text, p_table uuid, p_results jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int; v_host uuid;
begin
  if auth.uid() is null or not private.is_member(p_diwaniya) then
    raise exception 'only members of this diwaniya can score' using errcode = '42501';
  end if;
  if not private.profile_live(auth.uid()) then
    raise exception 'your account is under review' using errcode = '42501';
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
  select host_id into v_host from public.diwaniyas where id = p_diwaniya;
  -- Every named player was really there: seated at this table, approved for a night here, a
  -- regular, or one of its managers. Never someone blocked either way, hidden or held.
  if exists (
    select 1 from jsonb_array_elements(p_results) e
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

-- ---------------------------------------------------------------- ADC-SEC-17 (3): every write path checks the caller

drop policy follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (user_id = auth.uid() and private.profile_live(auth.uid())
              and private.can_see_diwaniya(diwaniya_id) and not private.can_manage(diwaniya_id));

drop policy queue_insert on public.table_queue;
create policy queue_insert on public.table_queue for insert to authenticated
  with check (user_id = auth.uid() and private.profile_live(auth.uid())
              and private.can_see_nights(private.table_diwaniya(table_id))
              and private.is_member(private.table_diwaniya(table_id)));

create or replace function public.check_in(p_table uuid, p_seat_no int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_night uuid; v_r public.requests; v_id uuid;
begin
  if not private.profile_live(auth.uid()) then raise exception 'your account is under review' using errcode = '42501'; end if;
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

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'finish your profile first' using errcode = '42501';
  end if;
  if not private.profile_live(auth.uid()) then raise exception 'your account is under review' using errcode = '42501'; end if;
  if not private.push_endpoint_ok(p_endpoint) then raise exception 'unknown push service' using errcode = '22023'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
                                         auth = excluded.auth, created_at = now();
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc offset 10);
end $$;

-- Stats of a hidden or held person are as gone as his profile (player_relations already does this).
create or replace function public.player_stats(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if private.blocked_with(p_user)
     or not exists (select 1 from public.profiles p where p.id = p_user
                    and (p.id = auth.uid() or private.is_admin() or (p.hidden_at is null and p.held_at is null))) then
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

-- ---------------------------------------------------------------- ADC-SEC-17 (1)(2): a hide that survives deletion

-- One row per sign-in identity (provider + its subject id) of an account an admin hid. Only a
-- hash is kept, never the Google id itself; no grants, the private schema is not exposed.
create table private.banned_identities (
  identity_hash text primary key check (identity_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid,          -- the account it was taken from; no FK, so the row outlives the account
  reason text not null check (reason in ('hidden')),
  created_at timestamptz not null default now()
);
alter table private.banned_identities enable row level security;
revoke all on private.banned_identities from public, anon, authenticated;

create function private.identity_hashes(u uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to(i.provider || ':' || i.provider_id, 'UTF8')), 'hex')
  from auth.identities i where i.user_id = u
$$;

create function private.ban_identities(u uuid) returns void
language sql security definer set search_path = '' as $$
  insert into private.banned_identities (identity_hash, user_id, reason)
  select h, u, 'hidden' from private.identity_hashes(u) h
  on conflict (identity_hash) do nothing
$$;

create function private.is_banned(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.banned_identities b where b.identity_hash in (select private.identity_hashes(u)))
$$;

create or replace function public.complete_profile(p_name text, p_area text, p_birth_date date,
                                                   p_accept_terms boolean, p_confirm_male boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
        v_area text := btrim(regexp_replace(coalesce(p_area, ''), '[[:cntrl:]]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if private.is_banned(auth.uid()) then raise exception 'your account is under review' using errcode = '42501'; end if;
  if v_name = '' or v_area = '' then raise exception 'name and area are required' using errcode = '22023'; end if;
  if p_accept_terms is not true then raise exception 'accept the terms first' using errcode = '22023'; end if;
  if p_confirm_male is not true then raise exception 'diwaniyas here are for men only' using errcode = '22023'; end if;
  if p_birth_date is null or p_birth_date > (current_date - make_interval(years => private.min_age()))::date
     or p_birth_date < date '1900-01-01' then
    raise exception 'too young for Diwaniya Tonight' using errcode = '22023';
  end if;
  insert into public.profile_private (user_id, birth_date, terms_accepted_at, male_confirmed_at)
    values (auth.uid(), p_birth_date, now(), now())
    on conflict (user_id) do nothing;
  insert into public.profiles (id, display_name, area) values (auth.uid(), left(v_name, 40), left(v_area, 60))
    on conflict (id) do update set display_name = excluded.display_name, area = excluded.area;
end $$;

-- A held account waits for the review before it can delete itself; a hidden one may delete
-- (his data rights stay), but his identity stays banned, so he can't come back clean.
create or replace function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.profiles;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'confirm first' using errcode = '22023'; end if;
  select * into v_p from public.profiles where id = auth.uid();
  if v_p.held_at is not null and v_p.hidden_at is null then
    raise exception 'your account is under review' using errcode = '42501';
  end if;
  if v_p.hidden_at is not null then perform private.ban_identities(auth.uid()); end if;
  update public.game_results set name = 'لاعب سابق' where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- ADC-SEC-16: request and cancel limits

create or replace function public.request_seat(p_night uuid, p_table uuid, p_eta_minutes int, p_note text, p_accept_rules boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_d uuid; v_night public.nights; v_dw public.diwaniyas; v_auto boolean; v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'finish your profile first' using errcode = '42501';
  end if;
  if not private.profile_live(auth.uid()) then
    raise exception 'your account is under review' using errcode = '42501';
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
  -- Two tries a night (cancelled or declined), and five requests in any 10 minutes.
  if (select count(*) from public.requests where night_id = p_night and user_id = auth.uid()
        and status in ('cancelled','declined')) >= 2 then
    raise exception 'no more requests for this night' using errcode = '54000';
  end if;
  if (select count(*) from public.requests where user_id = auth.uid()
        and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too many requests, wait a few minutes' using errcode = '54000';
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

-- Cancelling an approved seat tells the managers (a seat opened up). A pending request that is
-- taken back pings nobody: it simply leaves the host's live list.
create or replace function public.cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.requests;
begin
  select * into v_r from public.requests where id = p_request and user_id = auth.uid() for update;
  if v_r.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_r.status not in ('pending','approved') then raise exception 'cannot cancel now' using errcode = '22023'; end if;
  update public.requests set status = 'cancelled', decided_at = now() where id = p_request;
  delete from public.seats s using public.game_tables g
   where s.table_id = g.id and g.night_id = v_r.night_id and s.user_id = auth.uid();
  if v_r.status = 'approved' then
    perform private.notify_managers(private.night_diwaniya(v_r.night_id), 'cancelled', v_r.night_id, p_request);
  end if;
end $$;

-- Defence in depth: the inbox keeps every item, but one person gets at most one push of the same
-- kind for the same diwaniya every 2 minutes (announcements are capped at 5 a night already).
create function private.push_wanted(p_id uuid, p_user uuid, p_kind text, p_diwaniya uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_kind = 'announcement' or not exists (
    select 1 from public.inbox i
    where i.user_id = p_user and i.kind = p_kind and i.diwaniya_id is not distinct from p_diwaniya
      and i.id <> p_id and i.created_at > now() - interval '2 minutes'
      and i.created_at <= (select created_at from public.inbox where id = p_id))
$$;

create or replace function private.inbox_push_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not private.push_wanted(new.id, new.user_id, new.kind, new.diwaniya_id) then return new; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'dt_push_hook_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'dt_push_hook_secret';
  if v_url is null or v_secret is null then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('inbox_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000);
  return new;
exception when others then
  return new;
end $$;

-- ---------------------------------------------------------------- ADC-SEC-19: reporters see their report, not the review

revoke select on public.reports from authenticated;
grant select (id, reporter_id, target_user, target_diwaniya, target_label, reason, details, status, created_at, reviewed_at)
  on public.reports to authenticated;

-- ---------------------------------------------------------------- ADC-SEC-20: who counts toward a hold

alter table public.reports add column counts_to_hold boolean not null default false;

-- A real link: for a diwaniya, a request there the host answered (approved, arrived, declined,
-- no-show), being a regular, or following it for 7+ days. For a person, a game together, or a
-- night where the reporter was answered or ran it and the person was there (any request) or ran it.
create function private.reporter_linked(r uuid, tu uuid, td uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (td is not null and (
            exists (select 1 from public.requests q join public.nights n on n.id = q.night_id
                    where n.diwaniya_id = td and q.user_id = r and q.status in ('approved','arrived','declined','no_show'))
            or exists (select 1 from public.regulars g where g.diwaniya_id = td and g.user_id = r)
            or exists (select 1 from public.follows f where f.diwaniya_id = td and f.user_id = r
                       and f.created_at < now() - interval '7 days')))
      or (tu is not null and (
            exists (select 1 from public.game_results a join public.game_results b on b.game_id = a.game_id
                    join public.played_games pg on pg.id = a.game_id and pg.undone_at is null
                    where a.user_id = r and b.user_id = tu)
            or exists (select 1 from public.nights n
                       where (exists (select 1 from public.requests q where q.night_id = n.id and q.user_id = r
                                      and q.status in ('approved','arrived','declined','no_show'))
                              or private.manages(r, n.diwaniya_id))
                         and (exists (select 1 from public.requests q where q.night_id = n.id and q.user_id = tu)
                              or private.manages(tu, n.diwaniya_id)))))
$$;

create or replace function private.reports_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.target_user is null and new.target_diwaniya is null then
    raise exception 'nothing to report' using errcode = '22023';
  end if;
  if not private.profile_live(new.reporter_id) then
    raise exception 'your account is under review' using errcode = '42501';
  end if;
  if new.target_user = new.reporter_id
     or exists (select 1 from public.diwaniyas d where d.id = new.target_diwaniya and d.host_id = new.reporter_id) then
    raise exception 'you cannot report yourself' using errcode = '22023';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = new.reporter_id
       and r.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too many reports today' using errcode = '54000';
  end if;
  new.status := 'open'; new.reviewed_at := null; new.reviewed_by := null; new.review_note := '';
  new.details := left(btrim(regexp_replace(coalesce(new.details, ''), '[[:cntrl:]]', ' ', 'g')), 1000);
  new.target_label := left(coalesce(
    (select d.name from public.diwaniyas d where d.id = new.target_diwaniya),
    (select p.display_name from public.profiles p where p.id = new.target_user), ''), 100);
  new.counts_to_hold := private.reporter_linked(new.reporter_id, new.target_user, new.target_diwaniya);
  return new;
end $$;

-- Held while 3+ different linked reporters have an open report; every admin is told when it starts.
create or replace function private.recheck_hold(u uuid, d uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_was timestamptz; v_now timestamptz;
begin
  if u is not null then
    select held_at into v_was from public.profiles where id = u;
    update public.profiles set held_at = case
      when (select count(distinct r.reporter_id) from public.reports r
            where r.target_user = u and r.status = 'open' and r.counts_to_hold) >= 3 then coalesce(held_at, now()) end
    where id = u returning held_at into v_now;
    if v_was is null and v_now is not null then
      insert into public.inbox (user_id, kind, body)
      select a.user_id, 'held', left((select display_name from public.profiles where id = u), 300)
      from private.admins a join public.profiles p on p.id = a.user_id;
    end if;
  end if;
  if d is not null then
    select held_at into v_was from public.diwaniyas where id = d;
    update public.diwaniyas set held_at = case
      when (select count(distinct r.reporter_id) from public.reports r
            where r.target_diwaniya = d and r.status = 'open' and r.counts_to_hold) >= 3 then coalesce(held_at, now()) end
    where id = d returning held_at into v_now;
    if v_was is null and v_now is not null then
      insert into public.inbox (user_id, kind, diwaniya_id, body)
      select a.user_id, 'held', d, left((select name from public.diwaniyas where id = d), 300)
      from private.admins a join public.profiles p on p.id = a.user_id;
    end if;
  end if;
end $$;

-- The queue also says whether each report counts toward a hold.
create or replace function public.admin_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('open','dismissed','actioned') then raise exception 'bad status' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select r.id, r.reason, r.details, r.status, r.created_at, r.reviewed_at, r.review_note, r.target_label,
             r.counts_to_hold,
             jsonb_build_object('id', rp.id, 'name', rp.display_name) as reporter,
             case when tu.id is not null then jsonb_build_object(
               'id', tu.id, 'name', tu.display_name, 'hidden_at', tu.hidden_at, 'held_at', tu.held_at,
               'open_reports', (select count(*) from public.reports o where o.target_user = tu.id and o.status = 'open')) end as target_user,
             case when td.id is not null then jsonb_build_object(
               'id', td.id, 'name', td.name, 'area', td.area, 'hidden_at', td.hidden_at, 'held_at', td.held_at,
               'open_reports', (select count(*) from public.reports o where o.target_diwaniya = td.id and o.status = 'open')) end as target_diwaniya
      from public.reports r
      left join public.profiles rp on rp.id = r.reporter_id
      left join public.profiles tu on tu.id = r.target_user
      left join public.diwaniyas td on td.id = r.target_diwaniya
      where r.status = p_status
      order by r.created_at desc
      limit 200) x), '[]'::jsonb);
end $$;

-- Hiding a person also bans his sign-in identities (ADC-SEC-17); unhiding lifts it.
create or replace function public.admin_review(p_report uuid, p_action text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_r public.reports;
begin
  perform private.require_admin();
  select * into v_r from public.reports where id = p_report for update;
  if v_r.id is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  if v_r.status <> 'open' then raise exception 'already reviewed' using errcode = '22023'; end if;
  if p_action = 'hide_user' then
    if v_r.target_user is null then raise exception 'no person on this report' using errcode = '22023'; end if;
    update public.profiles set hidden_at = coalesce(hidden_at, now()) where id = v_r.target_user;
    update public.diwaniyas set hidden_at = coalesce(hidden_at, now()) where host_id = v_r.target_user;
    perform private.ban_identities(v_r.target_user);
  elsif p_action = 'hide_diwaniya' then
    if v_r.target_diwaniya is null then raise exception 'no diwaniya on this report' using errcode = '22023'; end if;
    update public.diwaniyas set hidden_at = coalesce(hidden_at, now()) where id = v_r.target_diwaniya;
  elsif p_action <> 'dismiss' then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  update public.reports set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         reviewed_at = now(), reviewed_by = auth.uid(),
         review_note = left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), 500)
   where id = p_report;
  perform private.recheck_hold(v_r.target_user, v_r.target_diwaniya);
  return case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;
end $$;

create or replace function public.admin_unhide(p_user uuid, p_diwaniya uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_note text := left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), 500);
        v_hid timestamptz;
begin
  perform private.require_admin();
  if p_user is null and p_diwaniya is null then raise exception 'nothing to unhide' using errcode = '22023'; end if;
  if p_user is not null then
    -- hide_user hid his diwaniyas in the same moment; bring back exactly those (found on the r2 run:
    -- unhiding a person left his diwaniyas hidden)
    select hidden_at into v_hid from public.profiles where id = p_user;
    update public.diwaniyas set hidden_at = null where host_id = p_user and hidden_at = v_hid;
    update public.profiles set hidden_at = null, held_at = null where id = p_user;
    delete from private.banned_identities
     where user_id = p_user or identity_hash in (select private.identity_hashes(p_user));
    update public.reports set status = 'dismissed', reviewed_at = now(), reviewed_by = auth.uid(), review_note = v_note
     where target_user = p_user and status = 'open';
  end if;
  if p_diwaniya is not null then
    update public.diwaniyas set hidden_at = null, held_at = null where id = p_diwaniya;
    update public.reports set status = 'dismissed', reviewed_at = now(), reviewed_by = auth.uid(), review_note = v_note
     where target_diwaniya = p_diwaniya and status = 'open';
  end if;
end $$;

-- ---------------------------------------------------------------- grants

-- New private helpers: nobody but the definer functions, except those policies call.
revoke all on function private.blocked_between(uuid, uuid), private.manages(uuid, uuid), private.seat_ok(uuid, uuid),
  private.identity_hashes(uuid), private.ban_identities(uuid), private.is_banned(uuid),
  private.push_wanted(uuid, uuid, text, uuid), private.reporter_linked(uuid, uuid, uuid),
  private.cohosts_invited() from public, anon, authenticated;
grant execute on function private.blocked_between(uuid, uuid), private.manages(uuid, uuid), private.seat_ok(uuid, uuid)
  to authenticated;

revoke all on function public.accept_cohost(uuid) from public, anon;
grant execute on function public.accept_cohost(uuid) to authenticated;

-- Rewritten RPCs keep their grants (create or replace); re-stated so the file reads on its own.
revoke all on function public.request_seat(uuid, uuid, int, text, boolean), public.cancel_request(uuid),
  public.check_in(uuid, int), public.record_game(uuid, text, uuid, jsonb), public.player_stats(uuid),
  public.save_push_subscription(text, text, text), public.delete_my_account(text),
  public.complete_profile(text, text, date, boolean, boolean), public.admin_reports(text),
  public.admin_review(uuid, text, text), public.admin_unhide(uuid, uuid, text) from public, anon;
grant execute on function public.request_seat(uuid, uuid, int, text, boolean), public.cancel_request(uuid),
  public.check_in(uuid, int), public.record_game(uuid, text, uuid, jsonb), public.player_stats(uuid),
  public.save_push_subscription(text, text, text), public.delete_my_account(text),
  public.complete_profile(text, text, date, boolean, boolean), public.admin_reports(text),
  public.admin_review(uuid, text, text), public.admin_unhide(uuid, uuid, text) to authenticated;
