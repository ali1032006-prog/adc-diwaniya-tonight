-- v1 completion tests (supabase/migrations/20261117201907_v1_complete.sql): push subscriptions, the second
-- ping tier and the 30-minute throttle, host announcements, reports, holds and the admin
-- moderation queue (ruling D), partner/rival stats and delete my account.
-- One transaction that always rolls back; checks are scoped to this test's own ids so the mock
-- pilot data can stay on dev. Run: python3 scripts/sql_test.py supabase/tests/v1_complete_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-v1-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000c1',  -- H host
  '00000000-0000-4000-8000-0000000000c2',  -- G guest, follows H's diwaniya
  '00000000-0000-4000-8000-0000000000c3',  -- A admin
  '00000000-0000-4000-8000-0000000000c4',  -- R1 reporter
  '00000000-0000-4000-8000-0000000000c5',  -- R2 reporter
  '00000000-0000-4000-8000-0000000000c6',  -- R3 reporter
  '00000000-0000-4000-8000-0000000000c7',  -- P opted in to kout in H's area
  '00000000-0000-4000-8000-0000000000c8',  -- Q opted in to kout in another area
  '00000000-0000-4000-8000-0000000000c9'   -- X stranger
]) u;
insert into private.admins (user_id) values ('00000000-0000-4000-8000-0000000000c3');

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- 0. anon gets none of it
set local role anon;
do $$
begin
  begin perform public.admin_reports('open'); raise exception 'FAIL: anon admin_reports';
  exception when insufficient_privilege then null; end;
  begin perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/x', repeat('a', 87), 'abcdefghabcdefgh');
    raise exception 'FAIL: anon saved a push subscription';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.push_subscriptions limit 1; raise exception 'FAIL: anon read push_subscriptions';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.announcements limit 1; raise exception 'FAIL: anon read announcements';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_my_account('DELETE'); raise exception 'FAIL: anon delete_my_account';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000000c1'; G uuid := '00000000-0000-4000-8000-0000000000c2';
  A uuid := '00000000-0000-4000-8000-0000000000c3'; R1 uuid := '00000000-0000-4000-8000-0000000000c4';
  R2 uuid := '00000000-0000-4000-8000-0000000000c5'; R3 uuid := '00000000-0000-4000-8000-0000000000c6';
  P uuid := '00000000-0000-4000-8000-0000000000c7'; Q uuid := '00000000-0000-4000-8000-0000000000c8';
  X uuid := '00000000-0000-4000-8000-0000000000c9';
  u uuid; v_d uuid; v_n uuid; v_t uuid; v_q uuid; v_rep uuid; v_cnt int; v_j jsonb; i int;
  key text := repeat('B', 87); au text := 'abcdefghabcdefgh';
begin
  foreach u in array array[H, G, A, R1, R2, R3, P, Q, X] loop
    perform pg_temp.act(u);
    perform public.complete_profile('V' || right(u::text, 2), 'Qurtuba', date '1990-01-01', true);
  end loop;

  -- 1. push subscriptions: RPC only, push-service hosts only, own rows only, 10 devices at most
  perform pg_temp.act(G);
  begin perform public.save_push_subscription('https://evil.example/hook', key, au);
    raise exception 'FAIL: non push-service endpoint accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.save_push_subscription('http://fcm.googleapis.com/fcm/send/abc', key, au);
    raise exception 'FAIL: plain http endpoint accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.save_push_subscription('https://fcm.googleapis.com.evil.example/fcm/send/abc', key, au);
    raise exception 'FAIL: look-alike host accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/abc', 'not base64!', au);
    raise exception 'FAIL: bad key accepted';
  exception when check_violation then null; end;
  begin insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
      values (G, 'https://fcm.googleapis.com/fcm/send/direct', key, au);
    raise exception 'FAIL: direct insert into push_subscriptions';
  exception when insufficient_privilege then null; end;
  for i in 1..11 loop
    perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/dev' || i, key, au);
  end loop;
  perform public.save_push_subscription('https://web.push.apple.com/QGx-apple_token', key, au);
  perform public.save_push_subscription('https://wns2-par02p.notify.windows.com/w/?token=BQYAAA%2b', key, au);
  select count(*) into v_cnt from public.push_subscriptions where user_id = G;
  if v_cnt <> 10 then raise exception 'FAIL: % subscriptions kept, want 10', v_cnt; end if;
  begin perform p256dh from public.push_subscriptions limit 1; raise exception 'FAIL: keys readable';
  exception when insufficient_privilege then null; end;
  perform pg_temp.act(H);
  if exists (select 1 from public.push_subscriptions where user_id = G) then raise exception 'FAIL: H sees G''s devices'; end if;

  -- 2. host opens a night in a unique area; G follows; P opted in to kout here, Q elsewhere
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area) values (H, 'Diwaniya V1 Test', 'الخيران') returning id into v_d;
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() + interval '2 hours') returning id into v_n;
  insert into public.game_tables (night_id, game, seat_count) values (v_n, 'kout', 6) returning id into v_t;
  perform pg_temp.act(G);
  insert into public.follows (user_id, diwaniya_id) values (G, v_d);
  perform pg_temp.act(P);
  update public.profile_private set ping_games = '{kout}', ping_areas = '{" الخيران "}' where user_id = P;
  perform pg_temp.act(Q);
  update public.profile_private set ping_games = '{kout}', ping_areas = '{الجهراء}' where user_id = Q;

  -- 3. need one: followers and opted-in area players, once per 30 minutes
  perform pg_temp.act(H);
  select public.set_need_one(v_t, true) into v_cnt;
  if v_cnt < 2 then raise exception 'FAIL: need one pinged %, want G and P', v_cnt; end if;
  reset role;
  if not exists (select 1 from public.inbox where user_id = G and table_id = v_t and kind = 'need_one') then
    raise exception 'FAIL: follower G not pinged'; end if;
  if not exists (select 1 from public.inbox where user_id = P and table_id = v_t and kind = 'need_one') then
    raise exception 'FAIL: area player P not pinged'; end if;
  if exists (select 1 from public.inbox where user_id in (Q, H, X) and table_id = v_t) then
    raise exception 'FAIL: pinged someone outside the tiers'; end if;
  set local role authenticated;
  perform pg_temp.act(H);
  perform public.set_need_one(v_t, false);
  select public.set_need_one(v_t, true) into v_cnt;
  if v_cnt <> -1 then raise exception 'FAIL: second ping round inside 30 minutes returned %', v_cnt; end if;
  reset role;
  if (select count(*) from public.inbox where user_id = P and table_id = v_t) <> 1 then
    raise exception 'FAIL: P pinged twice inside 30 minutes'; end if;
  if not (select need_one from public.game_tables where id = v_t) then raise exception 'FAIL: flag not on'; end if;
  set local role authenticated;

  -- 4. announcement: approved guests only, managers only, 5 a night
  perform pg_temp.act(G);
  v_q := public.request_seat(v_n, v_t, 15, '', true);
  begin perform public.announce(v_n, 'hi'); raise exception 'FAIL: guest announced';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(R1);
  perform public.request_seat(v_n, v_t, 15, '', true);  -- stays pending
  perform pg_temp.act(H);
  perform public.decide_request(v_q, true);
  begin perform public.announce(v_n, E' \u0007 '); raise exception 'FAIL: empty announcement';
  exception when sqlstate '22023' then null; end;
  select public.announce(v_n, 'Bring the dallah') into v_cnt;
  if v_cnt <> 1 then raise exception 'FAIL: announcement reached %, want only G', v_cnt; end if;
  perform pg_temp.act(G);
  if (select body from public.inbox where user_id = G and kind = 'announcement' and night_id = v_n) <> 'Bring the dallah' then
    raise exception 'FAIL: G did not get the announcement'; end if;
  if exists (select 1 from public.announcements) then raise exception 'FAIL: guest reads announcements log'; end if;
  perform pg_temp.act(R1);
  if exists (select 1 from public.inbox where user_id = R1 and kind = 'announcement') then
    raise exception 'FAIL: pending guest got the announcement'; end if;
  perform pg_temp.act(H);
  for i in 2..5 loop perform public.announce(v_n, 'note ' || i); end loop;
  begin perform public.announce(v_n, 'sixth'); raise exception 'FAIL: sixth announcement';
  exception when sqlstate '54000' then null; end;

  -- 5. partner / rival stats: H and G beat R1 and X (R1 approved tonight, X a regular: games name
  --    only people who were really there, ADC-SEC-18)
  perform pg_temp.act(H);
  perform public.decide_request((select id from public.requests where night_id = v_n and user_id = R1), true);
  insert into public.regulars (diwaniya_id, user_id) values (v_d, X);
  perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', H, 'name', 'h', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 2, 'user_id', R1, 'name', 'r', 'team', 2, 'points', 80, 'won', false),
    jsonb_build_object('seat', 3, 'user_id', G, 'name', 'g', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 4, 'user_id', X, 'name', 'x', 'team', 2, 'points', 80, 'won', false)));
  perform pg_temp.act(G);
  v_j := public.player_relations(H);
  if (v_j->'with_me'->>'partner_games')::int <> 1 or (v_j->'with_me'->>'partner_wins')::int <> 1
     or (v_j->'with_me'->>'rival_games')::int <> 0 then raise exception 'FAIL: partner stats %', v_j; end if;
  if jsonb_array_length(v_j->'played_with') <> 3 then raise exception 'FAIL: played_with %', v_j->'played_with'; end if;
  perform pg_temp.act(R1);
  v_j := public.player_relations(H);
  if (v_j->'with_me'->>'rival_games')::int <> 1 or (v_j->'with_me'->>'his_wins')::int <> 1
     or (v_j->'with_me'->>'my_wins')::int <> 0 then raise exception 'FAIL: rival stats %', v_j; end if;
  perform pg_temp.act(H);
  if public.player_relations(H)->'with_me' <> 'null'::jsonb then raise exception 'FAIL: with_me on own profile'; end if;
  perform pg_temp.act(G);
  insert into public.blocks (blocker_id, blocked_id) values (G, X);
  perform pg_temp.act(X);
  begin perform public.player_relations(G); raise exception 'FAIL: blocked user read relations';
  exception when sqlstate 'P0002' then null; end;

  -- 6. reports: one a person, never yourself, name snapshot, 10 a day
  perform pg_temp.act(H);
  begin insert into public.reports (target_diwaniya, reason) values (v_d, 'other'); raise exception 'FAIL: reported own diwaniya';
  exception when sqlstate '22023' then null; end;
  begin insert into public.reports (target_user, reason) values (H, 'other'); raise exception 'FAIL: reported self';
  exception when sqlstate '22023' then null; end;
  perform pg_temp.act(G);
  begin insert into public.reports (reason) values ('other'); raise exception 'FAIL: report without a target';
  exception when sqlstate '22023' then null; end;
  insert into public.reports (target_diwaniya, reason, details) values (v_d, 'safety', 'loud') returning id into v_rep;
  if (select target_label from public.reports where id = v_rep) <> 'Diwaniya V1 Test' then raise exception 'FAIL: no name snapshot'; end if;
  begin insert into public.reports (target_user, reason, status) values (H, 'other', 'dismissed');
    raise exception 'FAIL: reporter set the status';
  exception when insufficient_privilege then null; end;

  -- non-admins can't open the queue
  begin perform public.admin_reports('open'); raise exception 'FAIL: non-admin read the queue';
  exception when sqlstate '42501' then null; end;
  if public.am_i_admin() then raise exception 'FAIL: G is admin'; end if;

  -- 7. three different linked people reporting holds the diwaniya from everyone else (R2, R3
  --    regulars; G and R1 approved there; ADC-SEC-20)
  perform pg_temp.act(H);
  insert into public.regulars (diwaniya_id, user_id) values (v_d, R2), (v_d, R3);
  perform pg_temp.act(R1); insert into public.reports (target_diwaniya, reason) values (v_d, 'fake');
  perform pg_temp.act(R1); insert into public.reports (target_diwaniya, reason) values (v_d, 'fake');
  reset role;
  if (select held_at from public.diwaniyas where id = v_d) is not null then raise exception 'FAIL: held with 2 reporters'; end if;
  set local role authenticated;
  perform pg_temp.act(R2); insert into public.reports (target_diwaniya, reason) values (v_d, 'fake');
  reset role;
  if (select held_at from public.diwaniyas where id = v_d) is null then raise exception 'FAIL: not held with 3 reporters'; end if;
  set local role authenticated;
  perform pg_temp.act(R3); insert into public.reports (target_diwaniya, reason) values (v_d, 'harassment');
  perform pg_temp.act(X);
  if exists (select 1 from public.diwaniyas where id = v_d) then raise exception 'FAIL: held diwaniya visible to X'; end if;
  if exists (select 1 from public.nights where id = v_n) then raise exception 'FAIL: held diwaniya''s night on Tonight'; end if;
  perform pg_temp.act(H);
  if not exists (select 1 from public.diwaniyas where id = v_d and held_at is not null) then
    raise exception 'FAIL: host can''t see his held diwaniya'; end if;
  begin perform public.set_need_one(v_t, true); raise exception 'FAIL: held diwaniya pinged';
  exception when sqlstate '42501' then null; end;

  -- 8. admin: queue, dismiss releases the hold below 3 reporters, hide, unhide
  perform pg_temp.act(A);
  if not public.am_i_admin() then raise exception 'FAIL: A not admin'; end if;
  v_j := public.admin_reports('open');
  if not exists (select 1 from jsonb_array_elements(v_j) e where (e->>'id')::uuid = v_rep
                 and (e->'target_diwaniya'->>'open_reports')::int = 5) then
    raise exception 'FAIL: queue missing the report or its count'; end if;
  for v_q in select id from public.reports where reporter_id = R1 and target_diwaniya = v_d loop
    perform public.admin_review(v_q, 'dismiss', 'duplicate');
  end loop;
  reset role;
  if (select held_at from public.diwaniyas where id = v_d) is null then raise exception 'FAIL: released with 3 reporters left'; end if;
  set local role authenticated;
  perform pg_temp.act(A);
  perform public.admin_review((select id from public.reports where reporter_id = R2 and target_diwaniya = v_d), 'dismiss', '');
  reset role;
  if (select held_at from public.diwaniyas where id = v_d) is not null then raise exception 'FAIL: hold kept below 3 reporters'; end if;
  set local role authenticated;
  perform pg_temp.act(A);
  begin perform public.admin_review(v_rep, 'hide_user', ''); raise exception 'FAIL: hide_user on a diwaniya report';
  exception when sqlstate '22023' then null; end;
  perform public.admin_review(v_rep, 'hide_diwaniya', 'checked the night');
  begin perform public.admin_review(v_rep, 'dismiss', ''); raise exception 'FAIL: reviewed twice';
  exception when sqlstate '22023' then null; end;
  perform pg_temp.act(X);
  if exists (select 1 from public.diwaniyas where id = v_d) then raise exception 'FAIL: hidden diwaniya visible'; end if;
  perform pg_temp.act(A);
  if (public.admin_hidden()->'diwaniyas') @> jsonb_build_array(jsonb_build_object('id', v_d)) is not true then
    raise exception 'FAIL: admin_hidden misses it'; end if;
  if (public.admin_summary()->>'hidden_diwaniyas')::int < 1 then raise exception 'FAIL: summary'; end if;
  perform public.admin_unhide(null, v_d, 'restored');
  perform pg_temp.act(X);
  if not exists (select 1 from public.diwaniyas where id = v_d) then raise exception 'FAIL: unhidden diwaniya still gone'; end if;
  reset role;
  if exists (select 1 from public.reports where target_diwaniya = v_d and status = 'open') then
    raise exception 'FAIL: unhide left open reports'; end if;
  set local role authenticated;

  -- 9. X alone can't hold anyone (distinct reporters) and stops at 10 reports a day
  perform pg_temp.act(X);
  for i in 1..10 loop insert into public.reports (target_user, reason) values (H, 'other'); end loop;
  begin insert into public.reports (target_user, reason) values (H, 'other'); raise exception 'FAIL: 11th report';
  exception when sqlstate '54000' then null; end;
  reset role;
  if (select held_at from public.profiles where id = H) is not null then raise exception 'FAIL: one person held H'; end if;
  set local role authenticated;

  -- 10. hide a person: he and his diwaniyas vanish for others; he can't host or request anew
  perform pg_temp.act(A);
  perform public.admin_review((select id from public.reports where reporter_id = X and target_user = H limit 1), 'hide_user', 'warned twice');
  perform pg_temp.act(G);
  if exists (select 1 from public.profiles where id = H) then raise exception 'FAIL: hidden person visible'; end if;
  if exists (select 1 from public.diwaniyas where id = v_d) then raise exception 'FAIL: hidden person''s diwaniya visible'; end if;
  perform pg_temp.act(H);
  if not exists (select 1 from public.profiles where id = H) then raise exception 'FAIL: hidden person can''t see himself'; end if;
  begin insert into public.diwaniyas (host_id, name, area) values (H, 'Again', 'الروضة'); raise exception 'FAIL: hidden person hosted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.act(A);
  if not exists (select 1 from public.profiles where id = H) then raise exception 'FAIL: admin can''t see hidden person'; end if;
  perform public.admin_unhide(H, null, '');
  perform pg_temp.act(G);
  if not exists (select 1 from public.profiles where id = H) then raise exception 'FAIL: unhidden person still gone'; end if;

  -- 11. delete my account: confirm word, auth row gone, league names become 'former player'
  perform pg_temp.act(R1);
  begin perform public.delete_my_account('yes'); raise exception 'FAIL: deleted without the confirm word';
  exception when sqlstate '22023' then null; end;
  perform public.delete_my_account('DELETE');
  reset role;
  if exists (select 1 from auth.users where id = R1) then raise exception 'FAIL: auth user kept'; end if;
  if exists (select 1 from public.profiles where id = R1) then raise exception 'FAIL: profile kept'; end if;
  if not exists (select 1 from public.game_results where user_id is null and name = 'لاعب سابق') then
    raise exception 'FAIL: league row lost or name kept'; end if;
  if exists (select 1 from public.reports where reporter_id = R1) then raise exception 'FAIL: deleted person''s reports kept'; end if;
  set local role authenticated;
end $$;
reset role;

select 'v1_complete_test green' as result;
rollback;
