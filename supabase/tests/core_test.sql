-- Behaviour and access tests for the Diwaniyatna core schema
-- (supabase/migrations/20261117182827_core_schema.sql + 20261117192322_signin_men_only.sql). One transaction that always rolls
-- back. Users are acted out with request.jwt.claims under role authenticated. Visibility checks are
-- scoped to this test's own diwaniya, so the mock pilot data (supabase/seed/mock_pilot.sql) can stay on dev.
-- Run: python3 scripts/sql_test.py
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-test-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000a1',  -- H host
  '00000000-0000-4000-8000-0000000000a2',  -- C co-host
  '00000000-0000-4000-8000-0000000000a3',  -- G guest
  '00000000-0000-4000-8000-0000000000a4',  -- R regular
  '00000000-0000-4000-8000-0000000000a5',  -- S stranger
  '00000000-0000-4000-8000-0000000000a6',  -- B blocked later
  '00000000-0000-4000-8000-0000000000a7',  -- Y too young
  '00000000-0000-4000-8000-0000000000a8'   -- N not a follower
]) u;

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
-- Clears the 30-minute ping throttle (tested in v1_complete_test.sql) so the cap and game
-- filter can be checked on the same table. Runs as the test's owner.
create function pg_temp.unthrottle(t uuid) returns void language sql security definer as $$
  update public.game_tables set need_one_pinged_at = null where id = t
$$;

-- 0. anon gets nothing
set local role anon;
do $$
begin
  begin perform 1 from public.profiles limit 1; raise exception 'FAIL: anon read profiles';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.nights limit 1; raise exception 'FAIL: anon read nights';
  exception when insufficient_privilege then null; end;
  begin perform public.complete_profile('x', 'y', date '1990-01-01', true); raise exception 'FAIL: anon RPC';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.league_standings limit 1; raise exception 'FAIL: anon read standings';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000000a1'; C uuid := '00000000-0000-4000-8000-0000000000a2';
  G uuid := '00000000-0000-4000-8000-0000000000a3'; R uuid := '00000000-0000-4000-8000-0000000000a4';
  S uuid := '00000000-0000-4000-8000-0000000000a5'; B uuid := '00000000-0000-4000-8000-0000000000a6';
  Y uuid := '00000000-0000-4000-8000-0000000000a7'; N uuid := '00000000-0000-4000-8000-0000000000a8';
  u uuid; v_d uuid; v_n uuid; t_kout uuid; t_bal uuid; q_g uuid; q_r uuid; q_s uuid; q_b uuid;
  v_game uuid; v_cnt int; v_txt text; v_j jsonb;
begin
  -- 1. profile: age gate, terms, once-only birth date
  perform pg_temp.act(Y);
  begin perform public.complete_profile('Young', 'السالمية', (current_date - interval '16 years')::date, true);
    raise exception 'FAIL: under-age profile accepted';
  exception when sqlstate '22023' then null; end;
  perform pg_temp.act(H);
  begin perform public.complete_profile('Hamad', 'القيروان', date '1980-05-01', false);
    raise exception 'FAIL: profile without terms accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.complete_profile(E'\u0007 ', 'القيروان', date '1980-05-01', true);
    raise exception 'FAIL: blank name accepted';
  exception when sqlstate '22023' then null; end;
  foreach u in array array[H, C, G, R, S, B, N] loop
    perform pg_temp.act(u);
    perform public.complete_profile('P' || right(u::text, 2), 'القيروان', date '1990-01-01', true);
  end loop;
  perform pg_temp.act(G);
  perform public.complete_profile('Ghanim', 'الجابرية', date '2001-01-01', true);
  select count(*) into v_cnt from public.profile_private;
  if v_cnt <> 1 then raise exception 'FAIL: saw % private rows', v_cnt; end if;
  if (select birth_date from public.profile_private) <> date '1990-01-01' then
    raise exception 'FAIL: birth date changed on second call'; end if;
  if (select display_name from public.profiles where id = G) <> 'Ghanim' then raise exception 'FAIL: name not updated'; end if;
  begin update public.profile_private set birth_date = date '1970-01-01'; raise exception 'FAIL: birth date editable';
  exception when insufficient_privilege then null; end;
  begin insert into public.profiles (id, display_name, area) values (Y, 'x', 'y'); raise exception 'FAIL: direct profile insert';
  exception when insufficient_privilege then null; end;
  update public.profile_private set theme = 'day', lang = 'en';

  -- 2. host builds a diwaniya; nobody else can claim or edit it
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area, approval, guest_cap, pin_unlock_minutes, rules)
    values (H, 'Diwaniya Al-Hamad', 'القيروان', 'regulars_auto', 1, 60, 'No stakes. Tea is on us.') returning id into v_d;
  begin insert into public.diwaniyas (host_id, name, area) values (G, 'Fake', 'القيروان'); raise exception 'FAIL: diwaniya for someone else';
  exception when insufficient_privilege then null; end;
  insert into public.diwaniya_pins (diwaniya_id, lat, lng, directions) values (v_d, 29.33000, 47.99000, 'Second gate');
  insert into public.cohosts (diwaniya_id, user_id) values (v_d, C);
  insert into public.regulars (diwaniya_id, user_id) values (v_d, R);
  perform set_config('test.d', v_d::text, true);
  perform pg_temp.act(C);  -- co-hosts are invited and accept (ADC-SEC-18)
  perform public.accept_cohost(v_d);

  perform pg_temp.act(G);
  update public.diwaniyas set name = 'Hijacked' where id = v_d;
  if (select name from public.diwaniyas where id = v_d) <> 'Diwaniya Al-Hamad' then raise exception 'FAIL: guest edited diwaniya'; end if;
  if exists (select 1 from public.diwaniya_pins) then raise exception 'FAIL: guest saw pin before approval'; end if;
  begin insert into public.cohosts (diwaniya_id, user_id) values (v_d, G); raise exception 'FAIL: guest made self co-host';
  exception when insufficient_privilege then null; end;
  begin insert into public.regulars (diwaniya_id, user_id) values (v_d, G); raise exception 'FAIL: guest made self regular';
  exception when insufficient_privilege then null; end;

  -- 3. co-host opens tonight with two tables
  perform pg_temp.act(C);
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() + interval '30 minutes') returning id into v_n;
  if (select pin_unlock_at from public.nights where id = v_n) <> (select starts_at - interval '60 minutes' from public.nights where id = v_n) then
    raise exception 'FAIL: pin unlock time not derived'; end if;
  begin insert into public.nights (diwaniya_id, starts_at) values (v_d, now()); raise exception 'FAIL: two open nights';
  exception when unique_violation then null; end;
  insert into public.game_tables (night_id, game, seat_count, label) values (v_n, 'kout', 6, 'Kout') returning id into t_kout;
  insert into public.game_tables (night_id, game, seat_count, label) values (v_n, 'baloot', 4, 'Baloot') returning id into t_bal;
  begin insert into public.game_tables (night_id, game, seat_count) values (v_n, 'kout', 5); raise exception 'FAIL: 5-seat kout';
  exception when check_violation then null; end;
  perform pg_temp.act(G);
  begin insert into public.game_tables (night_id, game, seat_count) values (v_n, 'trix', 4); raise exception 'FAIL: guest added table';
  exception when insufficient_privilege then null; end;
  begin update public.game_tables set need_one = true where id = t_kout; raise exception 'FAIL: need_one set directly';
  exception when insufficient_privilege then null; end;

  -- 4. follow + 'need one' fan-out: followers G, S and regular R, not the hosts
  foreach u in array array[G, S] loop
    perform pg_temp.act(u);
    insert into public.follows (user_id, diwaniya_id) values (u, v_d);
  end loop;
  perform pg_temp.act(H);
  begin insert into public.follows (user_id, diwaniya_id) values (H, v_d); raise exception 'FAIL: host followed own';
  exception when insufficient_privilege then null; end;
  v_cnt := public.set_need_one(t_kout, true);
  if v_cnt <> 3 then raise exception 'FAIL: need_one pinged % (want 3)', v_cnt; end if;
  perform pg_temp.act(G);
  begin perform public.set_need_one(t_kout, true); raise exception 'FAIL: guest rang need_one';
  exception when sqlstate 'P0002' then null; end;
  if (select count(*) from public.inbox where kind = 'need_one') <> 1 then raise exception 'FAIL: G inbox need_one'; end if;
  if (select count(*) from public.inbox) <> 1 then raise exception 'FAIL: G saw others'' inbox'; end if;

  -- 5. requests: rules, duplicates, auto-approve for regulars
  begin perform public.request_seat(v_n, t_kout, 15, 'on my way', false); raise exception 'FAIL: rules not required';
  exception when sqlstate '22023' then null; end;
  q_g := public.request_seat(v_n, t_kout, 15, E'on my way\u0007', true);
  begin perform public.request_seat(v_n, t_kout, 15, 'again', true); raise exception 'FAIL: duplicate request';
  exception when unique_violation then null; end;
  if (select note from public.requests where id = q_g) <> 'on my way' then raise exception 'FAIL: note not cleaned'; end if;
  begin insert into public.requests (night_id, user_id) values (v_n, G); raise exception 'FAIL: direct request insert';
  exception when insufficient_privilege then null; end;
  begin update public.requests set status = 'approved' where id = q_g; raise exception 'FAIL: guest self-approved';
  exception when insufficient_privilege then null; end;
  perform pg_temp.act(R);
  q_r := public.request_seat(v_n, null, 0, '', true);
  if (select status from public.requests where id = q_r) <> 'approved' then raise exception 'FAIL: regular not auto-approved'; end if;
  perform pg_temp.act(S);
  q_s := public.request_seat(v_n, t_bal, 30, '', true);
  if (select count(*) from public.requests) <> 1 then raise exception 'FAIL: S saw others'' requests'; end if;
  perform pg_temp.act(H);
  begin perform public.request_seat(v_n, null, 0, '', true); raise exception 'FAIL: host requested own seat';
  exception when sqlstate '22023' then null; end;
  if (select count(*) from public.inbox where kind in ('request','auto_approved')) <> 3 then
    raise exception 'FAIL: host inbox has % request items', (select count(*) from public.inbox where kind in ('request','auto_approved')); end if;

  -- 6. decisions: only managers, guest cap of 1 (auto-approved regulars don't count)
  perform pg_temp.act(G);
  begin perform public.decide_request(q_g, true); raise exception 'FAIL: guest decided';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(C);
  v_txt := public.decide_request(q_g, true);
  if v_txt <> 'approved' then raise exception 'FAIL: approve returned %', v_txt; end if;
  begin perform public.decide_request(q_s, true); raise exception 'FAIL: guest cap ignored';
  exception when sqlstate '23514' then null; end;
  if public.decide_request(q_s, false) <> 'declined' then raise exception 'FAIL: decline'; end if;
  begin perform public.decide_request(q_g, false); raise exception 'FAIL: decided twice';
  exception when sqlstate '22023' then null; end;

  -- 7. pin: approved guest yes (unlock time passed), declined stranger no
  perform pg_temp.act(G);
  if (select count(*) from public.diwaniya_pins) <> 1 then raise exception 'FAIL: approved guest has no pin'; end if;
  if not exists (select 1 from public.inbox where kind = 'approved' and request_id = q_g) then raise exception 'FAIL: no approval inbox'; end if;
  perform pg_temp.act(S);
  if exists (select 1 from public.diwaniya_pins) then raise exception 'FAIL: declined stranger saw pin'; end if;

  -- 8. check-in: seats, bounds, taken seats, queue
  perform pg_temp.act(S);
  begin perform public.check_in(t_kout, 1); raise exception 'FAIL: declined user checked in';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(G);
  insert into public.table_queue (table_id, user_id) values (t_kout, G);
  perform public.check_in(t_kout, 3);
  if (select status from public.requests where id = q_g) <> 'arrived' then raise exception 'FAIL: not arrived'; end if;
  if exists (select 1 from public.table_queue where user_id = G) then raise exception 'FAIL: queue not cleared on check-in'; end if;
  perform pg_temp.act(R);
  begin perform public.check_in(t_bal, 5); raise exception 'FAIL: seat 5 at a 4-seat table';
  exception when sqlstate '22023' then null; end;
  begin perform public.check_in(t_kout, 3); raise exception 'FAIL: taken seat';
  exception when unique_violation then null; end;
  perform public.check_in(t_kout, 4);
  perform pg_temp.act(S);
  begin insert into public.table_queue (table_id, user_id) values (t_kout, S); raise exception 'FAIL: non-member queued';
  exception when insufficient_privilege then null; end;
  begin insert into public.seats (table_id, seat_no, walk_in_name) values (t_kout, 1, 'X'); raise exception 'FAIL: stranger placed a seat';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.seats where table_id in (t_kout, t_bal)) <> 2 then raise exception 'FAIL: S cannot see live seats'; end if;
  perform pg_temp.act(H);
  insert into public.seats (table_id, seat_no, walk_in_name) values (t_kout, 1, 'Uncle Saad');

  -- 9. no-show marks only after the start, and they reach the player
  begin perform public.mark_request(q_r, 'no_show'); raise exception 'FAIL: early no-show';
  exception when sqlstate '22023' then null; end;
  update public.nights set starts_at = now() - interval '1 hour' where id = v_n;
  perform public.mark_request(q_r, 'no_show');
  perform pg_temp.act(R);
  if not exists (select 1 from public.inbox where kind = 'no_show') then raise exception 'FAIL: no-show not told'; end if;
  perform pg_temp.act(H);
  perform public.mark_request(q_r, 'arrived');

  -- 10. daily cap and game filter on pings
  perform pg_temp.act(S);
  update public.profile_private set ping_daily_cap = 1;
  perform pg_temp.act(H);
  perform pg_temp.unthrottle(t_kout);
  if public.set_need_one(t_kout, true) <> 0 then raise exception 'FAIL: cap 1 ignored'; end if;
  perform pg_temp.act(S);
  update public.profile_private set ping_daily_cap = 3, ping_games = array['kout'];
  begin update public.profile_private set ping_daily_cap = 9; raise exception 'FAIL: cap above 3';
  exception when check_violation then null; end;
  perform pg_temp.act(H);
  if public.set_need_one(t_bal, true) <> 0 then raise exception 'FAIL: game filter ignored'; end if;
  perform pg_temp.unthrottle(t_kout);
  if public.set_need_one(t_kout, true) <> 1 then raise exception 'FAIL: kout ping to S'; end if;

  -- 11. block: B's pending request is declined, follow dropped, everything hidden both ways
  perform pg_temp.act(B);
  insert into public.follows (user_id, diwaniya_id) values (B, v_d);
  q_b := public.request_seat(v_n, null, 10, '', true);
  perform pg_temp.act(H);
  insert into public.blocks (blocker_id, blocked_id) values (H, B);
  begin perform public.player_stats(B); raise exception 'FAIL: stats of blocked user';
  exception when sqlstate 'P0002' then null; end;
  begin insert into public.regulars (diwaniya_id, user_id) values (v_d, B); raise exception 'FAIL: blocked made regular';
  exception when insufficient_privilege then null; end;
  perform pg_temp.act(B);
  if (select status from public.requests where id = q_b) <> 'declined' then raise exception 'FAIL: blocked request still open'; end if;
  if exists (select 1 from public.follows where diwaniya_id = v_d) then raise exception 'FAIL: blocked follow kept'; end if;
  if exists (select 1 from public.diwaniyas where id = v_d) then raise exception 'FAIL: blocked sees diwaniya'; end if;
  if exists (select 1 from public.nights where diwaniya_id = v_d) or exists (select 1 from public.seats where table_id in (t_kout, t_bal)) then raise exception 'FAIL: blocked sees night'; end if;
  if exists (select 1 from public.profiles where id = H) then raise exception 'FAIL: blocked sees host profile'; end if;
  if exists (select 1 from public.blocks) then raise exception 'FAIL: blocked sees the block row'; end if;
  begin perform public.request_seat(v_n, null, 0, '', true); raise exception 'FAIL: blocked requested';
  exception when sqlstate 'P0002' then null; end;
  begin insert into public.follows (user_id, diwaniya_id) values (B, v_d); raise exception 'FAIL: blocked re-followed';
  exception when insufficient_privilege then null; end;

  -- 12. followers-only nights
  perform pg_temp.act(H);
  update public.diwaniyas set visibility = 'followers' where id = v_d;
  perform pg_temp.act(N);
  if not exists (select 1 from public.diwaniyas where id = v_d) then raise exception 'FAIL: N cannot see the diwaniya card'; end if;
  if exists (select 1 from public.nights where diwaniya_id = v_d) or exists (select 1 from public.game_tables where night_id = v_n) then raise exception 'FAIL: N sees followers-only night'; end if;
  begin perform public.request_seat(v_n, null, 0, '', true); raise exception 'FAIL: N requested followers-only';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(S);
  if not exists (select 1 from public.nights where diwaniya_id = v_d) then raise exception 'FAIL: follower lost the night'; end if;

  -- 13. league: members score, strangers can't; undo; season table and stats
  perform pg_temp.act(S);
  begin perform public.record_game(v_d, 'kout_bo6', t_kout, '[{"seat":1,"name":"a","team":1,"points":1,"won":true},{"seat":2,"name":"b","team":2,"points":0,"won":false}]');
    raise exception 'FAIL: stranger scored';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(G);
  begin perform public.record_game(v_d, 'kout_bo6', t_kout, '[{"seat":1,"name":"a","team":1,"points":1,"won":true}]');
    raise exception 'FAIL: one-player game';
  exception when sqlstate '22023' then null; end;
  begin perform public.record_game(v_d, 'kout_bo6', t_kout, jsonb_build_array(
      jsonb_build_object('seat',1,'user_id','00000000-0000-4000-8000-0000000000ff','team',1,'points',1,'won',true),
      jsonb_build_object('seat',2,'name','b','team',2,'points',0,'won',false)));
    raise exception 'FAIL: unknown player';
  exception when sqlstate '22023' then null; end;
  v_game := public.record_game(v_d, 'kout_bo6', t_kout, jsonb_build_array(
    jsonb_build_object('seat',1,'user_id',G,'team',1,'points',6,'won',true),
    jsonb_build_object('seat',2,'user_id',R,'team',2,'points',3,'won',false),
    jsonb_build_object('seat',3,'user_id',H,'team',1,'points',6,'won',true),
    jsonb_build_object('seat',4,'name','Uncle Saad','team',2,'points',3,'won',false),
    jsonb_build_object('seat',5,'user_id',C,'team',1,'points',6,'won',true),
    jsonb_build_object('seat',6,'name','Walk-in','team',2,'points',3,'won',false)));
  -- 4 accounts + 2 walk-ins: walk-in names count in the league too since ADC-LOG-754 (was 4)
  if (select count(*) from public.league_standings where diwaniya_id = v_d) <> 6 then raise exception 'FAIL: standings rows'; end if;
  v_j := public.player_stats(G);
  if (v_j->>'games')::int <> 1 or (v_j->>'wins')::int <> 1 or (v_j->>'nights_shown')::int <> 1 then
    raise exception 'FAIL: stats %', v_j; end if;
  if (public.player_stats(R)->>'no_shows')::int <> 0 then raise exception 'FAIL: corrected no-show still counted'; end if;
  perform pg_temp.act(B);
  if exists (select 1 from public.league_standings where diwaniya_id = v_d) then raise exception 'FAIL: blocked sees league'; end if;
  perform pg_temp.act(S);
  begin perform public.undo_game(v_game); raise exception 'FAIL: stranger undid';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(H);
  perform public.undo_game(v_game);
  if exists (select 1 from public.league_standings where diwaniya_id = v_d) then raise exception 'FAIL: undone game still counts'; end if;

  -- 14. reports are private to the reporter; inbox is own-only
  perform pg_temp.act(G);
  insert into public.reports (target_user, reason, details) values (B, 'harassment', 'test');
  begin insert into public.reports (reporter_id, target_user, reason) values (S, B, 'other'); raise exception 'FAIL: report as someone else';
  exception when insufficient_privilege then null; end;
  update public.inbox set read_at = now();
  begin insert into public.inbox (user_id, kind) values (G, 'approved'); raise exception 'FAIL: inbox insert';
  exception when insufficient_privilege then null; end;
  perform pg_temp.act(H);
  if exists (select 1 from public.reports) then raise exception 'FAIL: host sees G''s report'; end if;
  update public.inbox set read_at = now() where user_id = G;
  perform pg_temp.act(G);
  if exists (select 1 from public.inbox where read_at is null) then raise exception 'FAIL: G inbox not marked'; end if;

  -- 15. cancel frees the seat; host deletion cascades nothing it shouldn't
  perform pg_temp.act(R);
  begin perform public.cancel_request(q_g); raise exception 'FAIL: cancelled someone else''s';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(G);
  begin perform public.cancel_request(q_g); raise exception 'FAIL: cancelled after arriving';
  exception when sqlstate '22023' then null; end;
end $$;

reset role;
select 'core_test: ALL GREEN' as result;
rollback;
