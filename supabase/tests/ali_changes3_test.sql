-- Ali's change list 3 (ADC-LOG-781, migration *_ali_change_list_3.sql):
-- (2) Messages: people DM a diwaniya's host and the host replies. Only the two of them see the
--     thread (not co-hosts, not strangers); signed-in adults with a live profile only; a block
--     either way stops both sides; the host can turn messages off; rate limits; report a message
--     (the report keeps the words as evidence); one inbox ping per unread thread; Realtime.
-- (3) Score tab: score_targets() lists the tables the caller may score right now, best first,
--     or the reason he can't.
-- Written before the migration (red on 093b81d: function public.start_thread does not exist), applied on dev as 20261118132006.
-- One transaction that always rolls back. Run: python3 scripts/sql_test.py supabase/tests/ali_changes3_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-ali3-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000003e1',  -- H host of D (and of Q, messages off)
  '00000000-0000-4000-8000-0000000003e2',  -- G guest who writes to the host, then checks in
  '00000000-0000-4000-8000-0000000003e3',  -- B writes, then the host blocks him
  '00000000-0000-4000-8000-0000000003e4',  -- S stranger (never in a thread)
  '00000000-0000-4000-8000-0000000003e5',  -- C co-host of D (must not read the host's threads)
  '00000000-0000-4000-8000-0000000003e6',  -- N signed in, never finished the 18+ profile
  '00000000-0000-4000-8000-0000000003e7',  -- X hidden by an admin
  '00000000-0000-4000-8000-0000000003e8',  -- P approved tonight, not checked in yet
  '00000000-0000-4000-8000-0000000003e9'   -- A admin
]) u;

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.hide(u uuid) returns void language sql security definer as $$
  update public.profiles set hidden_at = now() where id = u
$$;
create function pg_temp.make_admin(u uuid) returns void language sql security definer as $$
  insert into private.admins (user_id) values (u)
$$;
-- reporters may not read the review columns, so the check reads as the table owner
create function pg_temp.message_reports(r uuid, tu uuid, m uuid, ev text) returns int language sql security definer as $$
  select count(*)::int from public.reports where reporter_id = r and target_user = tu and target_message = m
    and evidence = ev and counts_to_hold
$$;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000003e1'; G uuid := '00000000-0000-4000-8000-0000000003e2';
  B uuid := '00000000-0000-4000-8000-0000000003e3'; S uuid := '00000000-0000-4000-8000-0000000003e4';
  C uuid := '00000000-0000-4000-8000-0000000003e5'; N uuid := '00000000-0000-4000-8000-0000000003e6';
  X uuid := '00000000-0000-4000-8000-0000000003e7'; P uuid := '00000000-0000-4000-8000-0000000003e8';
  A uuid := '00000000-0000-4000-8000-0000000003e9';
  u uuid; v_d uuid; v_q uuid; v_n uuid; v_t uuid; v_t2 uuid; v_th uuid; v_thb uuid; v_m uuid; v_hm uuid;
  v_cnt int; v_txt text; v_j jsonb; i int; v_extra uuid;
begin
  foreach u in array array[H, G, B, S, C, X, P, A] loop
    perform pg_temp.act(u);
    perform public.complete_profile('AT' || right(u::text, 2), 'الخيران', date '1990-01-01', true);
  end loop;
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area) values (H, 'Diwaniya Ali3 Test', 'الخيران') returning id into v_d;
  insert into public.diwaniyas (host_id, name, area) values (H, 'Quiet Ali3 Test', 'الخيران') returning id into v_q;
  insert into public.cohosts (diwaniya_id, user_id) values (v_d, C);
  perform pg_temp.act(C); perform public.accept_cohost(v_d);

  -- ------------------------------------------------------------ (2) messages
  -- a guest writes to the host: the thread opens and both of them read it
  perform pg_temp.act(G);
  v_th := public.start_thread(v_d, '  Salam, is there kout tonight?  ');
  select count(*) into v_cnt from public.messages where thread_id = v_th;
  if v_cnt <> 1 then raise exception 'FAIL: (2) guest does not see his own message'; end if;
  select body into v_txt from public.messages where thread_id = v_th;
  if v_txt <> 'Salam, is there kout tonight?' then raise exception 'FAIL: (2) body not trimmed: %', v_txt; end if;
  -- writing again to the same diwaniya reuses the thread
  if public.start_thread(v_d, 'Second line') <> v_th then raise exception 'FAIL: (2) a second thread opened'; end if;

  perform pg_temp.act(H);
  select count(*) into v_cnt from public.messages where thread_id = v_th;
  if v_cnt <> 2 then raise exception 'FAIL: (2) host does not see the guest''s messages (%)', v_cnt; end if;
  if public.unread_messages() <> 2 then raise exception 'FAIL: (2) host unread count is %', public.unread_messages(); end if;
  -- one inbox ping for the unread thread, not one per message
  select count(*) into v_cnt from public.inbox where user_id = H and kind = 'message' and thread_id = v_th;
  if v_cnt <> 1 then raise exception 'FAIL: (2) host got % inbox pings for one unread thread', v_cnt; end if;
  v_hm := public.send_message(v_th, 'Yes, from nine');
  perform public.mark_thread_read(v_th);
  if public.unread_messages() <> 0 then raise exception 'FAIL: (2) mark_thread_read left messages unread'; end if;
  select count(*) into v_cnt from public.inbox where user_id = H and kind = 'message' and read_at is null;
  if v_cnt <> 0 then raise exception 'FAIL: (2) the inbox ping stayed unread after the thread was read'; end if;
  -- the thread list
  v_j := public.my_threads();
  if jsonb_array_length(v_j) <> 1 or (v_j->0->>'id')::uuid <> v_th or (v_j->0->>'role') <> 'host'
     or (v_j->0->>'other_name') <> 'ATe2' then
    raise exception 'FAIL: (2) host thread list wrong: %', v_j; end if;
  perform pg_temp.act(G);
  v_j := public.my_threads();
  if jsonb_array_length(v_j) <> 1 or (v_j->0->>'role') <> 'guest' or (v_j->0->>'unread')::int <> 1
     or (v_j->0->>'diwaniya_name') <> 'Diwaniya Ali3 Test' then
    raise exception 'FAIL: (2) guest thread list wrong: %', v_j; end if;

  -- only the two of them: not the co-host, not a stranger
  foreach u in array array[C, S] loop
    perform pg_temp.act(u);
    select count(*) into v_cnt from public.messages where thread_id = v_th;
    if v_cnt <> 0 then raise exception 'FAIL: (2) % reads a thread he is not in', u; end if;
    select count(*) into v_cnt from public.message_threads where id = v_th;
    if v_cnt <> 0 then raise exception 'FAIL: (2) % sees a thread he is not in', u; end if;
    if jsonb_array_length(public.my_threads()) <> 0 then raise exception 'FAIL: (2) % lists a thread he is not in', u; end if;
    begin perform public.send_message(v_th, 'hijack'); raise exception 'FAIL: (2) % wrote into someone else''s thread', u;
    exception when sqlstate 'P0002' then null; end;
    begin perform public.mark_thread_read(v_th); raise exception 'FAIL: (2) % marked someone else''s thread read', u;
    exception when sqlstate 'P0002' then null; end;
  end loop;

  -- no direct writes: everything goes through the checked functions
  perform pg_temp.act(G);
  begin insert into public.messages (thread_id, sender_id, body) values (v_th, G, 'direct');
    raise exception 'FAIL: (2) direct insert into messages';
  exception when insufficient_privilege then null; end;
  begin update public.messages set body = 'edited' where thread_id = v_th;
    raise exception 'FAIL: (2) direct update of messages';
  exception when insufficient_privilege then null; end;
  begin delete from public.messages where thread_id = v_th;
    raise exception 'FAIL: (2) direct delete of messages';
  exception when insufficient_privilege then null; end;
  begin insert into public.message_threads (diwaniya_id, guest_id, host_id) values (v_q, G, H);
    raise exception 'FAIL: (2) direct insert into message_threads';
  exception when insufficient_privilege then null; end;

  -- bodies: not empty, at most 1000 characters, control characters become spaces (new lines stay)
  begin perform public.send_message(v_th, '   '); raise exception 'FAIL: (2) empty message sent';
  exception when sqlstate '22023' then null; end;
  begin perform public.send_message(v_th, repeat('x', 1001)); raise exception 'FAIL: (2) 1001 characters sent';
  exception when sqlstate '22023' then null; end;
  v_m := public.send_message(v_th, 'line one' || chr(10) || 'two' || chr(7) || 'end');
  select body into v_txt from public.messages where id = v_m;
  if v_txt <> 'line one' || chr(10) || 'two end' then raise exception 'FAIL: (2) body not cleaned: %', v_txt; end if;

  -- the host cannot open a thread with his own diwaniya, nor can a co-host
  foreach u in array array[H, C] loop
    perform pg_temp.act(u);
    begin perform public.start_thread(v_d, 'me to me'); raise exception 'FAIL: (2) % messaged his own diwaniya', u;
    exception when sqlstate '22023' then null; end;
  end loop;

  -- signed in without the 18+ profile, or hidden: no messages
  perform pg_temp.act(N);
  begin perform public.start_thread(v_d, 'hi'); raise exception 'FAIL: (2) an account without the 18+ profile sent a message';
  exception when sqlstate '42501' then null; end;
  reset role; perform pg_temp.hide(X); set local role authenticated;
  perform pg_temp.act(X);
  begin perform public.start_thread(v_d, 'hi'); raise exception 'FAIL: (2) a hidden account sent a message';
  exception when sqlstate '42501' then null; end;

  -- blocks: B writes first, then the host blocks him; neither side can write after that
  perform pg_temp.act(B);
  v_thb := public.start_thread(v_d, 'hello host');
  perform pg_temp.act(H);
  insert into public.blocks (blocker_id, blocked_id) values (H, B);
  begin perform public.send_message(v_thb, 'reply'); raise exception 'FAIL: (2) host wrote to someone he blocked';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(B);
  begin perform public.send_message(v_thb, 'again'); raise exception 'FAIL: (2) blocked guest wrote to the host';
  exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  begin perform public.start_thread(v_q, 'other diwaniya'); raise exception 'FAIL: (2) blocked guest started a thread';
  exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  -- and a block the guest makes works the same way: P blocks the host
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area) values (H, 'Guest-block Ali3 Test', 'الخيران') returning id into v_extra;
  perform pg_temp.act(P);
  v_thb := public.start_thread(v_extra, 'before the block');
  insert into public.blocks (blocker_id, blocked_id) values (P, H);
  perform pg_temp.act(H);
  begin perform public.send_message(v_thb, 'reply'); raise exception 'FAIL: (2) host wrote to someone who blocked him';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(P);
  begin perform public.send_message(v_thb, 'after'); raise exception 'FAIL: (2) a guest wrote to a host he blocked';
  exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  delete from public.blocks where blocker_id = P and blocked_id = H;

  -- messages off: guests cannot write (new or old threads), the host can still answer
  perform pg_temp.act(H);
  update public.diwaniyas set messages_on = false where id = v_d;
  perform pg_temp.act(G);
  begin perform public.send_message(v_th, 'still there?'); raise exception 'FAIL: (2) guest wrote after messages were turned off';
  exception when sqlstate '42501' then null; end;
  begin perform public.start_thread(v_d, 'new'); raise exception 'FAIL: (2) guest started a thread with messages off';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(H);
  perform public.send_message(v_th, 'Messages are off, see you tonight');
  update public.diwaniyas set messages_on = true where id = v_d;
  -- only the host switches it
  perform pg_temp.act(G);
  update public.diwaniyas set messages_on = false where id = v_d;
  perform pg_temp.act(H);
  if not (select messages_on from public.diwaniyas where id = v_d) then raise exception 'FAIL: (2) a guest turned messages off'; end if;

  -- rate limit: at most 5 guest messages in a row before the host answers
  perform pg_temp.act(G);
  for i in 1..5 loop perform public.send_message(v_th, 'ping ' || i); end loop;
  begin perform public.send_message(v_th, 'ping 6'); raise exception 'FAIL: (2) sixth unanswered message accepted';
  exception when sqlstate '54000' then null; end;
  perform pg_temp.act(H); perform public.send_message(v_th, 'ok ok');
  perform pg_temp.act(G); perform public.send_message(v_th, 'thanks');
  -- rate limit: at most 10 new threads a day; S opens 10, the 11th is refused
  perform pg_temp.act(H);
  for i in 1..11 loop
    insert into public.diwaniyas (host_id, name, area) values (H, 'Spam target ' || i, 'الخيران') returning id into v_extra;
    perform pg_temp.act(S);
    if i <= 10 then
      perform public.start_thread(v_extra, 'hi ' || i);
    else
      begin perform public.start_thread(v_extra, 'hi 11'); raise exception 'FAIL: (2) eleventh new thread in a day accepted';
      exception when sqlstate '54000' then null; end;
    end if;
    perform pg_temp.act(H);
  end loop;

  -- report a message: only the one it was sent to; the words are kept as evidence
  perform pg_temp.act(G);
  begin perform public.report_message(v_m, 'harassment', ''); raise exception 'FAIL: (2) a sender reported his own message';
  exception when sqlstate '22023' then null; end;
  perform pg_temp.act(S);
  begin perform public.report_message(v_m, 'harassment', ''); raise exception 'FAIL: (2) a stranger reported a message';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(H);
  perform public.report_message(v_m, 'harassment', 'keeps writing');
  v_cnt := pg_temp.message_reports(H, G, v_m, 'line one' || chr(10) || 'two end');
  if v_cnt <> 1 then raise exception 'FAIL: (2) message report not stored with its evidence'; end if;
  -- the reporter cannot point a report at a message himself
  begin insert into public.reports (target_user, target_message, reason) values (G, v_m, 'other');
    raise exception 'FAIL: (2) direct report with target_message';
  exception when insufficient_privilege then null; end;
  -- the admin sees the words in the queue
  reset role; perform pg_temp.make_admin(A); set local role authenticated;
  perform pg_temp.act(A);
  select count(*) into v_cnt from jsonb_array_elements(public.admin_reports('open')) e
   where e->>'evidence' = 'line one' || chr(10) || 'two end';
  if v_cnt <> 1 then raise exception 'FAIL: (2) admin queue does not show the reported words'; end if;

  -- ------------------------------------------------------------ (3) score_targets
  perform pg_temp.act(H);
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() - interval '10 minutes') returning id into v_n;
  insert into public.game_tables (night_id, game, seat_count, label) values (v_n, 'kout', 4, 'A') returning id into v_t;
  insert into public.game_tables (night_id, game, seat_count, label) values (v_n, 'baloot', 4, 'B') returning id into v_t2;
  foreach u in array array[G, P] loop
    perform pg_temp.act(u);
    v_q := public.request_seat(v_n, v_t2, 0, '', true);
    perform pg_temp.act(H); perform public.decide_request(v_q, true);
  end loop;
  perform pg_temp.act(G); perform public.check_in(v_t2, 1);

  -- the seated guest: his own table first
  v_j := public.score_targets();
  if (v_j->'targets'->0->>'table_id')::uuid is distinct from v_t2 or (v_j->'targets'->0->>'why') <> 'seated' then
    raise exception 'FAIL: (3) seated guest not given his own table first: %', v_j; end if;
  -- the host: tonight's tables
  perform pg_temp.act(H);
  v_j := public.score_targets();
  select count(*) into v_cnt from jsonb_array_elements(v_j->'targets') e where (e->>'table_id')::uuid in (v_t, v_t2) and e->>'why' = 'host';
  if v_cnt <> 2 then raise exception 'FAIL: (3) host not given tonight''s tables: %', v_j; end if;
  -- approved but not sitting yet: nothing, and the reason says so
  perform pg_temp.act(P);
  v_j := public.score_targets();
  if jsonb_array_length(v_j->'targets') <> 0 or v_j->>'reason' <> 'approved' then
    raise exception 'FAIL: (3) approved-not-seated guest: %', v_j; end if;
  -- a stranger: nothing, plain reason
  perform pg_temp.act(S);
  v_j := public.score_targets();
  if jsonb_array_length(v_j->'targets') <> 0 or v_j->>'reason' <> 'none' then
    raise exception 'FAIL: (3) stranger: %', v_j; end if;
end $$;
reset role;

-- Realtime carries both tables (RLS still decides who receives what)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename in ('messages', 'message_threads')) <> 2 then
    raise exception 'FAIL: (2) messages are not on Realtime';
  end if;
  if exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' and table_name in ('messages', 'message_threads')) then
    raise exception 'FAIL: (2) anon holds a grant on the message tables';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.messages'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.message_threads'::regclass) then
    raise exception 'FAIL: (2) RLS is off on a message table';
  end if;
end $$;

select 'ali_changes3_test green' as result;
rollback;
