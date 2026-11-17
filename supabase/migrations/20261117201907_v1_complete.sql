-- Diwaniya Tonight, v1 completion slice (ADC-TSK-36).
-- What ADC-RES-49/50 still needed for v1:
--   * web push pings: push_subscriptions (RPC-only writes, push-service host allow-list) and an
--     inbox trigger that hands each new item to the send-ping Edge Function through pg_net;
--   * the moderation queue for Ali's admin role (ruling D, ADC-LOG-697): report status and review,
--     hide / unhide users and diwaniyas, and the "several open reports = held from Tonight until
--     reviewed" rule from ADC-RES-49 s.10;
--   * the second ping tier (opted-in players in the diwaniya's area who play that game) and one
--     ping round per table every 30 minutes (s.10 "ping fatigue");
--   * the host's announcement to approved guests (the only message before approval, s.5 kit 1);
--   * delete my account (CITRA rights in S14);
--   * partner / rival / played-with stats for S12.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- admins (ruling D)
-- Lives in the private schema, which the API does not expose: only the database owner can add
-- an admin (Ali's account, on his word). No grants to anon or authenticated.
create table private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table private.admins enable row level security;
revoke all on private.admins from public, anon, authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admins a where a.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------- hidden and held
-- hidden_at: an admin hid it. held_at: 3+ people reported it and it waits for review.
-- Either one takes it out of everyone's view except its own managers and the admins.
alter table public.profiles add column hidden_at timestamptz, add column held_at timestamptz;
alter table public.diwaniyas add column hidden_at timestamptz, add column held_at timestamptz;

create function private.profile_live(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = u and p.hidden_at is null and p.held_at is null)
$$;

create or replace function private.can_see_diwaniya(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diwaniyas x where x.id = d
                 and (private.can_manage(d) or private.is_admin()
                      or (not private.blocked_with(x.host_id) and x.hidden_at is null and x.held_at is null)))
$$;

create or replace function private.can_see_nights(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage(d) or exists (
    select 1 from public.diwaniyas x where x.id = d
      and not private.blocked_with(x.host_id)
      and x.hidden_at is null and x.held_at is null
      and (x.visibility = 'public'
           or exists (select 1 from public.follows f where f.diwaniya_id = d and f.user_id = auth.uid())
           or exists (select 1 from public.regulars r where r.diwaniya_id = d and r.user_id = auth.uid())))
$$;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_admin()
         or (not private.blocked_with(id) and hidden_at is null and held_at is null));

drop policy diwaniyas_read on public.diwaniyas;
create policy diwaniyas_read on public.diwaniyas for select to authenticated
  using (host_id = auth.uid() or private.can_manage(id) or private.is_admin()
         or (not private.blocked_with(host_id) and hidden_at is null and held_at is null));

drop policy diwaniyas_insert on public.diwaniyas;
create policy diwaniyas_insert on public.diwaniyas for insert to authenticated
  with check (host_id = auth.uid() and private.profile_live(auth.uid()));

-- ---------------------------------------------------------------- reports and review
alter table public.reports drop constraint reports_check;  -- a deleted account must not block the delete
alter table public.reports
  add column target_label text not null default '' check (char_length(target_label) <= 100),
  add column status text not null default 'open' check (status in ('open','dismissed','actioned')),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column review_note text not null default '' check (char_length(review_note) <= 500);
create index on public.reports (status, created_at desc);
create index on public.reports (target_user) where status = 'open';
create index on public.reports (target_diwaniya) where status = 'open';
drop policy reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or private.is_admin());

-- Before a report goes in: something to report, not yourself, at most 10 a day, and a snapshot of
-- the name so the evidence survives a deleted account.
create function private.reports_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.target_user is null and new.target_diwaniya is null then
    raise exception 'nothing to report' using errcode = '22023';
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
  return new;
end $$;
create trigger reports_before before insert on public.reports
  for each row execute function private.reports_before();

-- Held while 3 or more different people have an open report on it; released when that drops.
create function private.recheck_hold(u uuid, d uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if u is not null then
    update public.profiles set held_at = case
      when (select count(distinct r.reporter_id) from public.reports r
            where r.target_user = u and r.status = 'open') >= 3 then coalesce(held_at, now()) end
    where id = u;
  end if;
  if d is not null then
    update public.diwaniyas set held_at = case
      when (select count(distinct r.reporter_id) from public.reports r
            where r.target_diwaniya = d and r.status = 'open') >= 3 then coalesce(held_at, now()) end
    where id = d;
  end if;
end $$;

create function private.reports_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.recheck_hold(new.target_user, new.target_diwaniya);
  return new;
end $$;
create trigger reports_after after insert on public.reports
  for each row execute function private.reports_after();

revoke all on function private.reports_before(), private.reports_after(), private.recheck_hold(uuid, uuid)
  from public, anon, authenticated;

create function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_admin() $$;

create function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
end $$;

-- The queue: newest first, with who reported, what, and how many open reports each target has.
create function public.admin_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('open','dismissed','actioned') then raise exception 'bad status' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select r.id, r.reason, r.details, r.status, r.created_at, r.reviewed_at, r.review_note, r.target_label,
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

-- dismiss: nothing wrong. hide_user: the person and the diwaniyas he hosts disappear for everyone
-- else. hide_diwaniya: that diwaniya disappears. Holds are rechecked either way.
create function public.admin_review(p_report uuid, p_action text, p_note text)
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

-- Unhide clears both the admin's hide and any hold; open reports on it are closed as dismissed.
create function public.admin_unhide(p_user uuid, p_diwaniya uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_note text := left(btrim(regexp_replace(coalesce(p_note, ''), '[[:cntrl:]]', ' ', 'g')), 500);
begin
  perform private.require_admin();
  if p_user is null and p_diwaniya is null then raise exception 'nothing to unhide' using errcode = '22023'; end if;
  if p_user is not null then
    update public.profiles set hidden_at = null, held_at = null where id = p_user;
    update public.reports set status = 'dismissed', reviewed_at = now(), reviewed_by = auth.uid(), review_note = v_note
     where target_user = p_user and status = 'open';
  end if;
  if p_diwaniya is not null then
    update public.diwaniyas set hidden_at = null, held_at = null where id = p_diwaniya;
    update public.reports set status = 'dismissed', reviewed_at = now(), reviewed_by = auth.uid(), review_note = v_note
     where target_diwaniya = p_diwaniya and status = 'open';
  end if;
end $$;

-- Everything hidden or held right now.
create function public.admin_hidden()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'area', p.area,
                       'hidden_at', p.hidden_at, 'held_at', p.held_at) order by coalesce(p.hidden_at, p.held_at) desc)
                       from public.profiles p where p.hidden_at is not null or p.held_at is not null), '[]'::jsonb),
    'diwaniyas', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'area', d.area,
                       'hidden_at', d.hidden_at, 'held_at', d.held_at) order by coalesce(d.hidden_at, d.held_at) desc)
                       from public.diwaniyas d where d.hidden_at is not null or d.held_at is not null), '[]'::jsonb));
end $$;

-- The numbers for the summary Ali asked to have written to him (ruling D).
create function public.admin_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'open', (select count(*) from public.reports where status = 'open'),
    'open_by_reason', coalesce((select jsonb_object_agg(reason, n) from
       (select reason, count(*) n from public.reports where status = 'open' group by reason) s), '{}'::jsonb),
    'new_7d', (select count(*) from public.reports where created_at > now() - interval '7 days'),
    'reviewed_7d', (select count(*) from public.reports where reviewed_at > now() - interval '7 days'),
    'held_users', (select count(*) from public.profiles where held_at is not null and hidden_at is null),
    'held_diwaniyas', (select count(*) from public.diwaniyas where held_at is not null and hidden_at is null),
    'hidden_users', (select count(*) from public.profiles where hidden_at is not null),
    'hidden_diwaniyas', (select count(*) from public.diwaniyas where hidden_at is not null),
    'no_shows_7d', (select count(*) from public.requests where status = 'no_show' and decided_at > now() - interval '7 days'));
end $$;

-- ---------------------------------------------------------------- push subscriptions
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{8,64}$'),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select (id, user_id, endpoint, created_at, last_ok_at), delete on public.push_subscriptions to authenticated;

-- Only the browsers' own push services: the Edge Function POSTs to this URL, so anything else
-- would let a user point our server at a host of his choosing.
create function private.push_endpoint_ok(e text) returns boolean
language sql immutable set search_path = '' as $$
  select e ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|wns2-[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_:/.%~=+?&-]+$'
     and char_length(e) <= 1000
$$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'finish your profile first' using errcode = '42501';
  end if;
  if not private.push_endpoint_ok(p_endpoint) then raise exception 'unknown push service' using errcode = '22023'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
                                         auth = excluded.auth, created_at = now();
  -- at most 10 devices per person: the oldest goes
  delete from public.push_subscriptions where id in (
    select id from public.push_subscriptions where user_id = auth.uid() order by created_at desc offset 10);
end $$;

-- ---------------------------------------------------------------- inbox: announcements and push hook
alter table public.inbox drop constraint inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('request','approved','declined','auto_approved','cancelled','need_one','no_show','announcement'));
alter table public.inbox add column body text not null default '' check (char_length(body) <= 300),
                         add column pushed_at timestamptz;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 300),
  recipients int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.announcements (night_id, created_at desc);
alter table public.announcements enable row level security;
create policy announcements_read on public.announcements for select to authenticated
  using (private.can_manage(private.night_diwaniya(night_id)));
revoke all on public.announcements from public, anon, authenticated;
grant select on public.announcements to authenticated;

-- The host's word to the guests he approved for tonight: the only message anyone gets from a
-- diwaniya, and never one-to-one (ADC-RES-49 s.5, kit 1). 5 per night at most.
create function public.announce(p_night uuid, p_text text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_d uuid := private.night_diwaniya(p_night);
        v_text text := left(btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g')), 300);
        v_n int;
begin
  if v_d is null or not private.can_manage(v_d) then raise exception 'night not found' using errcode = 'P0002'; end if;
  if (select status from public.nights where id = p_night) <> 'open' then
    raise exception 'this night is closed' using errcode = '22023';
  end if;
  if v_text = '' then raise exception 'write something first' using errcode = '22023'; end if;
  if (select count(*) from public.announcements where night_id = p_night) >= 5 then
    raise exception 'five announcements a night at most' using errcode = '54000';
  end if;
  insert into public.inbox (user_id, kind, diwaniya_id, night_id, body)
  select distinct q.user_id, 'announcement', v_d, p_night, v_text
  from public.requests q
  where q.night_id = p_night and q.status in ('approved','arrived') and q.user_id <> auth.uid();
  get diagnostics v_n = row_count;
  insert into public.announcements (night_id, author_id, body, recipients) values (p_night, auth.uid(), v_text, v_n);
  return v_n;
end $$;

-- Every new inbox item is handed to the send-ping Edge Function (pg_net is asynchronous, so the
-- insert never waits). The URL and the shared secret live in Vault; without them nothing is sent.
create function private.inbox_push_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
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
  return new;  -- a ping that can't be handed over must never stop the inbox item
end $$;
create trigger inbox_push_hook after insert on public.inbox
  for each row execute function private.inbox_push_hook();
revoke all on function private.inbox_push_hook() from public, anon, authenticated;

-- ---------------------------------------------------------------- seat requests and pings
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

alter table public.game_tables add column need_one_pinged_at timestamptz;

-- 'Need one': first the diwaniya's followers and regulars who play that game, then (public
-- diwaniyas only) players who opted in to that game AND that area. Never the blocked, the hidden,
-- anyone already coming tonight, or anyone at his daily cap. One ping round per table per 30
-- minutes: inside that window the flag goes on and -1 comes back (nobody pinged again).
create or replace function public.set_need_one(p_table uuid, p_on boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_t public.game_tables; v_d uuid; v_dw public.diwaniyas; v_n int := 0;
begin
  select * into v_t from public.game_tables where id = p_table for update;
  v_d := private.table_diwaniya(p_table);
  if v_t.id is null or not private.can_manage(v_d) then raise exception 'table not found' using errcode = 'P0002'; end if;
  if p_on is not true then
    update public.game_tables set need_one = false, need_one_at = null where id = p_table;
    return 0;
  end if;
  select * into v_dw from public.diwaniyas where id = v_d;
  if v_dw.hidden_at is not null or v_dw.held_at is not null then
    raise exception 'this diwaniya is under review' using errcode = '42501';
  end if;
  update public.game_tables set need_one = true, need_one_at = now() where id = p_table;
  if v_t.need_one_pinged_at is not null and v_t.need_one_pinged_at > now() - interval '30 minutes' then
    return -1;
  end if;
  insert into public.inbox (user_id, kind, diwaniya_id, night_id, table_id)
  select a.user_id, 'need_one', v_d, v_t.night_id, p_table
  from (
    select f.user_id from public.follows f join public.profile_private pp on pp.user_id = f.user_id
     where f.diwaniya_id = v_d and (cardinality(pp.ping_games) = 0 or v_t.game = any (pp.ping_games))
    union
    select r.user_id from public.regulars r join public.profile_private pp on pp.user_id = r.user_id
     where r.diwaniya_id = v_d and (cardinality(pp.ping_games) = 0 or v_t.game = any (pp.ping_games))
    union
    select pp.user_id from public.profile_private pp
     where v_dw.visibility = 'public'
       and v_t.game = any (pp.ping_games)
       and exists (select 1 from unnest(pp.ping_areas) pa where lower(btrim(pa)) = lower(btrim(v_dw.area)))
  ) a
  join public.profile_private pp on pp.user_id = a.user_id
  join public.profiles p on p.id = a.user_id and p.hidden_at is null and p.held_at is null
  where a.user_id <> v_dw.host_id
    and not exists (select 1 from public.cohosts c where c.diwaniya_id = v_d and c.user_id = a.user_id)
    and not exists (select 1 from public.blocks b
                    where (b.blocker_id = v_dw.host_id and b.blocked_id = a.user_id)
                       or (b.blocker_id = a.user_id and b.blocked_id = v_dw.host_id))
    and not exists (select 1 from public.requests q where q.night_id = v_t.night_id and q.user_id = a.user_id
                    and q.status in ('pending','approved','arrived'))
    and (select count(*) from public.inbox i where i.user_id = a.user_id and i.kind = 'need_one'
         and i.created_at > now() - interval '24 hours') < pp.ping_daily_cap;
  get diagnostics v_n = row_count;
  update public.game_tables set need_one_pinged_at = now() where id = p_table;
  return v_n;
end $$;

-- ---------------------------------------------------------------- delete my account (S14)
-- Everything that is his goes with the auth user (cascades); his name in other people's league
-- history becomes 'former player' so their scores still add up.
create function public.delete_my_account(p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'confirm first' using errcode = '22023'; end if;
  update public.game_results set name = 'لاعب سابق' where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- partners, rivals, played with (S12)
create function public.player_relations(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if private.blocked_with(p_user)
     or not exists (select 1 from public.profiles p where p.id = p_user
                    and (p.id = v_me or private.is_admin() or (p.hidden_at is null and p.held_at is null))) then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  return (
    with g as (
      select pg.id from public.played_games pg
      where pg.undone_at is null and private.can_see_diwaniya(pg.diwaniya_id)
    ), his as (
      select r.game_id, r.team, r.won from public.game_results r join g on g.id = r.game_id where r.user_id = p_user
    ), mine as (
      select r.game_id, r.team, r.won from public.game_results r join g on g.id = r.game_id where r.user_id = v_me
    ), co as (
      select o.user_id, count(*) as games, count(*) filter (where o.team = h.team and h.won) as wins_together
      from his h join public.game_results o on o.game_id = h.game_id and o.user_id is not null and o.user_id <> p_user
      group by o.user_id
    )
    select jsonb_build_object(
      'with_me', case when p_user = v_me then null else jsonb_build_object(
        'partner_games', (select count(*) from his h join mine m using (game_id) where h.team = m.team),
        'partner_wins', (select count(*) from his h join mine m using (game_id) where h.team = m.team and h.won),
        'rival_games', (select count(*) from his h join mine m using (game_id) where h.team <> m.team),
        'his_wins', (select count(*) from his h join mine m using (game_id) where h.team <> m.team and h.won),
        'my_wins', (select count(*) from his h join mine m using (game_id) where h.team <> m.team and m.won)) end,
      'played_with', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'games', co.games,
                                            'wins_together', co.wins_together) order by co.games desc, p.display_name)
        from (select * from co order by games desc limit 6) co
        join public.profiles p on p.id = co.user_id and p.hidden_at is null and p.held_at is null
        where not private.blocked_with(co.user_id)), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function private.is_admin(), private.profile_live(uuid), private.require_admin(),
  private.push_endpoint_ok(text) from public, anon;
grant execute on function private.is_admin(), private.profile_live(uuid), private.push_endpoint_ok(text) to authenticated;

revoke all on function public.am_i_admin(), public.admin_reports(text), public.admin_review(uuid, text, text),
  public.admin_unhide(uuid, uuid, text), public.admin_hidden(), public.admin_summary(),
  public.save_push_subscription(text, text, text), public.announce(uuid, text),
  public.delete_my_account(text), public.player_relations(uuid) from public, anon;
grant execute on function public.am_i_admin(), public.admin_reports(text), public.admin_review(uuid, text, text),
  public.admin_unhide(uuid, uuid, text), public.admin_hidden(), public.admin_summary(),
  public.save_push_subscription(text, text, text), public.announce(uuid, text),
  public.delete_my_account(text), public.player_relations(uuid) to authenticated;
grant execute on function private.require_admin() to authenticated;

-- The rewritten RPCs keep their grants (create or replace), re-stated for clarity.
revoke all on function public.request_seat(uuid, uuid, int, text, boolean), public.set_need_one(uuid, boolean) from public, anon;
grant execute on function public.request_seat(uuid, uuid, int, text, boolean), public.set_need_one(uuid, boolean) to authenticated;
