-- Ali's change list 3 (ADC-LOG-781), database slice.
-- (2) Messages: a person writes to a diwaniya's host and the host replies (supersedes
--     ADC-RES-49's "no 1:1 messages before approval" for messages to hosts only).
--     Safety: signed in with the 18+ profile and not hidden or held; a block either way stops
--     both sides; the host can turn messages off for his diwaniya; at most 30 messages per 10
--     minutes per sender, 5 guest messages in a row before the host answers, 10 new threads a
--     day; report a message (the words are kept as evidence for the admins). RLS: only the guest
--     and the host read a thread; nobody writes the tables directly; both tables on Realtime.
-- (3) Score tab: score_targets() lists what the caller may score right now, best first, or why not.
-- Test: supabase/tests/ali_changes3_test.sql (red on 093b81d, green after this file).

-- ---------------------------------------------------------------- (2) messages
alter table public.diwaniyas add column messages_on boolean not null default true;
grant update (messages_on) on public.diwaniyas to authenticated;

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  diwaniya_id uuid not null references public.diwaniyas(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (diwaniya_id, guest_id),
  check (guest_id <> host_id)
);
create index on public.message_threads (guest_id, last_at desc);
create index on public.message_threads (host_id, last_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,  -- the order messages were written in (now() ties inside a transaction)
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index on public.messages (thread_id, seq);
create index on public.messages (sender_id, created_at desc);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
revoke all on public.message_threads, public.messages from public, anon, authenticated;
grant select on public.message_threads, public.messages to authenticated;

create function private.in_thread(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_threads x where x.id = t and auth.uid() in (x.guest_id, x.host_id))
$$;
create policy threads_read on public.message_threads for select to authenticated
  using (auth.uid() = guest_id or auth.uid() = host_id);
create policy messages_read on public.messages for select to authenticated
  using (private.in_thread(thread_id));

-- The inbox ping for a new message points at its thread.
alter table public.inbox add column thread_id uuid references public.message_threads(id) on delete cascade;
alter table public.inbox drop constraint inbox_kind_check;
alter table public.inbox add constraint inbox_kind_check
  check (kind in ('request','approved','declined','auto_approved','cancelled','need_one','no_show',
                  'announcement','cohost_invite','held','message'));

-- A sender in good standing: signed in, 18+ profile finished, not hidden or held.
create function private.may_message() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and private.profile_live(auth.uid())
     and exists (select 1 from public.profile_private pp where pp.user_id = auth.uid()
                 and pp.birth_date <= (current_date - make_interval(years => private.min_age()))::date)
$$;

create function private.clean_body(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(coalesce(p, ''), '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g'))
$$;

-- One write path for both sides; every check lives here.
create function private.post_message(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_t public.message_threads; v_d public.diwaniyas; v_me uuid := auth.uid(); v_body text; v_id uuid; v_other uuid; v_run int;
begin
  if not private.may_message() then
    raise exception 'sign in with a finished 18+ profile to send messages' using errcode = '42501';
  end if;
  select * into v_t from public.message_threads where id = p_thread;
  if v_t.id is null or v_me not in (v_t.guest_id, v_t.host_id) then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  v_other := case when v_me = v_t.guest_id then v_t.host_id else v_t.guest_id end;
  if private.blocked_between(v_t.guest_id, v_t.host_id) then
    raise exception 'you cannot message each other' using errcode = '42501';
  end if;
  select * into v_d from public.diwaniyas where id = v_t.diwaniya_id;
  if v_me = v_t.guest_id and (not v_d.messages_on or v_d.hidden_at is not null or v_d.held_at is not null) then
    raise exception 'this diwaniya is not taking messages' using errcode = '42501';
  end if;
  v_body := private.clean_body(p_body);
  if char_length(v_body) = 0 or char_length(v_body) > 1000 then
    raise exception 'a message is 1 to 1000 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.messages m where m.sender_id = v_me and m.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'too many messages, wait a few minutes' using errcode = '54000';
  end if;
  if v_me = v_t.guest_id then
    select count(*) into v_run from public.messages m
     where m.thread_id = p_thread and m.sender_id = v_me
       and m.seq > coalesce((select max(h.seq) from public.messages h
                             where h.thread_id = p_thread and h.sender_id = v_t.host_id), 0);
    if v_run >= 5 then
      raise exception 'wait for the host to answer' using errcode = '54000';
    end if;
  end if;
  insert into public.messages (thread_id, sender_id, body) values (p_thread, v_me, v_body) returning id into v_id;
  update public.message_threads set last_at = now() where id = p_thread;
  -- one inbox ping (and push) per unread thread, not one per message
  if not exists (select 1 from public.inbox i where i.user_id = v_other and i.kind = 'message'
                 and i.thread_id = p_thread and i.read_at is null) then
    insert into public.inbox (user_id, kind, diwaniya_id, thread_id) values (v_other, 'message', v_t.diwaniya_id, p_thread);
  end if;
  return v_id;
end $$;

-- Write to a diwaniya's host: opens the thread the first time, reuses it after.
create function public.start_thread(p_diwaniya uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_d public.diwaniyas; v_me uuid := auth.uid(); v_t uuid;
begin
  if not private.may_message() then
    raise exception 'sign in with a finished 18+ profile to send messages' using errcode = '42501';
  end if;
  select * into v_d from public.diwaniyas where id = p_diwaniya;
  if v_d.id is null or not private.can_see_diwaniya(p_diwaniya) then
    raise exception 'diwaniya not found' using errcode = 'P0002';
  end if;
  if private.can_manage(p_diwaniya) then
    raise exception 'this is your own diwaniya' using errcode = '22023';
  end if;
  if private.blocked_between(v_d.host_id, v_me) then
    raise exception 'you cannot message each other' using errcode = '42501';
  end if;
  if not v_d.messages_on or v_d.hidden_at is not null or v_d.held_at is not null then
    raise exception 'this diwaniya is not taking messages' using errcode = '42501';
  end if;
  select id into v_t from public.message_threads where diwaniya_id = p_diwaniya and guest_id = v_me;
  if v_t is null then
    if (select count(*) from public.message_threads x where x.guest_id = v_me and x.created_at > now() - interval '24 hours') >= 10 then
      raise exception 'too many new conversations today' using errcode = '54000';
    end if;
    if char_length(private.clean_body(p_body)) = 0 or char_length(private.clean_body(p_body)) > 1000 then
      raise exception 'a message is 1 to 1000 characters' using errcode = '22023';
    end if;
    insert into public.message_threads (diwaniya_id, guest_id, host_id) values (p_diwaniya, v_me, v_d.host_id) returning id into v_t;
  end if;
  perform private.post_message(v_t, p_body);
  return v_t;
end $$;

create function public.send_message(p_thread uuid, p_body text) returns uuid
language sql security definer set search_path = '' as $$
  select private.post_message(p_thread, p_body)
$$;

create function public.mark_thread_read(p_thread uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.in_thread(p_thread) then raise exception 'conversation not found' using errcode = 'P0002'; end if;
  update public.messages set read_at = now() where thread_id = p_thread and sender_id <> auth.uid() and read_at is null;
  update public.inbox set read_at = now() where user_id = auth.uid() and kind = 'message' and thread_id = p_thread and read_at is null;
end $$;

create function public.unread_messages() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messages m join public.message_threads t on t.id = m.thread_id
   where auth.uid() in (t.guest_id, t.host_id) and m.sender_id <> auth.uid() and m.read_at is null
$$;

-- My conversations, newest first: the other person, the diwaniya, the last words, unread, can I write.
create function public.my_threads() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.last_at desc), '[]'::jsonb) from (
    select t.id, t.diwaniya_id, d.name as diwaniya_name, t.last_at,
           case when t.host_id = auth.uid() then 'host' else 'guest' end as role,
           o.id as other_id, o.display_name as other_name,
           (select m.body from public.messages m where m.thread_id = t.id order by m.seq desc limit 1) as last_body,
           (select m.sender_id = auth.uid() from public.messages m where m.thread_id = t.id order by m.seq desc limit 1) as last_mine,
           (select count(*) from public.messages m where m.thread_id = t.id and m.sender_id <> auth.uid() and m.read_at is null)::int as unread,
           private.blocked_between(t.guest_id, t.host_id) as blocked,
           (t.host_id = auth.uid() or (d.messages_on and d.hidden_at is null and d.held_at is null)) as open
    from public.message_threads t
    join public.diwaniyas d on d.id = t.diwaniya_id
    join public.profiles o on o.id = case when t.host_id = auth.uid() then t.guest_id else t.host_id end
    where auth.uid() in (t.guest_id, t.host_id)
    order by t.last_at desc
    limit 100) x
$$;

-- Report a message: only the person it was sent to; the words go with the report.
alter table public.reports
  add column target_message uuid references public.messages(id) on delete set null,
  add column evidence text not null default '' check (char_length(evidence) <= 1000);

create or replace function private.reports_before() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_m public.messages; v_t public.message_threads;
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
  new.evidence := '';
  if new.target_message is not null then
    select * into v_m from public.messages where id = new.target_message;
    select * into v_t from public.message_threads where id = v_m.thread_id;
    if v_m.id is null or new.reporter_id not in (v_t.guest_id, v_t.host_id) or v_m.sender_id = new.reporter_id
       or new.target_user is distinct from v_m.sender_id then
      raise exception 'message not found' using errcode = 'P0002';
    end if;
    new.evidence := v_m.body;
    new.counts_to_hold := true;  -- it was sent to the reporter: that is the link
  else
    new.counts_to_hold := private.reporter_linked(new.reporter_id, new.target_user, new.target_diwaniya);
  end if;
  return new;
end $$;

create function public.report_message(p_message uuid, p_reason text, p_details text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.messages;
begin
  select m.* into v_m from public.messages m where m.id = p_message and private.in_thread(m.thread_id);
  if v_m.id is null then raise exception 'message not found' using errcode = 'P0002'; end if;
  if v_m.sender_id = auth.uid() then raise exception 'you cannot report yourself' using errcode = '22023'; end if;
  insert into public.reports (reporter_id, target_user, target_message, reason, details)
  values (auth.uid(), v_m.sender_id, p_message, p_reason, coalesce(p_details, ''));
end $$;

-- Admins see the reported words next to the report.
create or replace function public.admin_reports(p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_status not in ('open','dismissed','actioned') then raise exception 'bad status' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc) from (
      select r.id, r.reason, r.details, r.status, r.created_at, r.reviewed_at, r.review_note, r.target_label,
             r.counts_to_hold, r.evidence,
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

-- ---------------------------------------------------------------- (3) score_targets
-- What the caller may score right now, best first: the table he sits at, tonight's tables where
-- he is checked in, the tables he runs, a regular's tables; then a table-less game where he is a
-- manager or regular and nothing is open. Empty = reason: 'approved' (sit first), 'pending', 'none'.
create function public.score_targets() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_targets jsonb; v_reason text;
begin
  if v_me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  with mine as (
    select d.id from public.diwaniyas d where private.can_manage(d.id)
    union select r.diwaniya_id from public.regulars r where r.user_id = v_me
    union select n.diwaniya_id from public.nights n join public.requests q on q.night_id = n.id
           where q.user_id = v_me and n.status = 'open' and q.status in ('approved','arrived')
    union select n.diwaniya_id from public.nights n join public.game_tables g on g.night_id = n.id
           join public.seats s on s.table_id = g.id where s.user_id = v_me and n.status = 'open'
  ), tables as (
    select d.id as diwaniya_id, d.name, g.id as table_id, g.game::text as game, g.seat_count::int as seat_count, g.label::text as label, n.starts_at,
           case when exists (select 1 from public.seats s where s.table_id = g.id and s.user_id = v_me) then 'seated'
                when private.can_manage(d.id) then 'host'
                when private.checked_in_at(d.id, g.id) then 'here'
                else 'regular' end as why
    from mine m join public.diwaniyas d on d.id = m.id
    join public.nights n on n.diwaniya_id = d.id and n.status = 'open'
    join public.game_tables g on g.night_id = n.id
    where private.can_score(d.id, g.id)
  ), loose as (
    select d.id as diwaniya_id, d.name, null::uuid as table_id, null::text as game, null::int as seat_count, ''::text as label,
           null::timestamptz as starts_at, case when private.can_manage(d.id) then 'host' else 'regular' end as why
    from mine m join public.diwaniyas d on d.id = m.id
    where (private.can_manage(d.id) or exists (select 1 from public.regulars r where r.diwaniya_id = d.id and r.user_id = v_me))
      and not exists (select 1 from tables t where t.diwaniya_id = d.id)
      and private.can_score(d.id, null)
  )
  select coalesce(jsonb_agg(row_to_json(x) order by
           case x.why when 'seated' then 0 when 'here' then 1 when 'host' then 2 else 3 end,
           x.table_id is null, x.starts_at, x.name, x.label), '[]'::jsonb)
    into v_targets
    from (select * from tables union all select * from loose limit 50) x;
  if jsonb_array_length(v_targets) = 0 then
    v_reason := case
      when exists (select 1 from public.requests q join public.nights n on n.id = q.night_id
                   where q.user_id = v_me and n.status = 'open' and q.status = 'approved') then 'approved'
      when exists (select 1 from public.requests q join public.nights n on n.id = q.night_id
                   where q.user_id = v_me and n.status = 'open' and q.status = 'pending') then 'pending'
      else 'none' end;
  end if;
  return jsonb_build_object('targets', v_targets, 'reason', v_reason);
end $$;

-- ---------------------------------------------------------------- grants and Realtime
revoke all on function private.in_thread(uuid), private.may_message(), private.clean_body(text),
  private.post_message(uuid, text) from public, anon;
grant execute on function private.in_thread(uuid), private.may_message(), private.clean_body(text) to authenticated;
revoke all on function private.post_message(uuid, text) from authenticated;
revoke all on function public.start_thread(uuid, text), public.send_message(uuid, text), public.mark_thread_read(uuid),
  public.unread_messages(), public.my_threads(), public.report_message(uuid, text, text), public.score_targets()
  from public, anon;
grant execute on function public.start_thread(uuid, text), public.send_message(uuid, text), public.mark_thread_read(uuid),
  public.unread_messages(), public.my_threads(), public.report_message(uuid, text, text), public.score_targets()
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_threads') then
      alter publication supabase_realtime add table public.message_threads;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end $$;
