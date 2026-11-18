-- Diwaniya on the TV (ADC-RES-54, Ali's approval ADC-LOG-817, no QR code anywhere):
-- (1) only a manager of the diwaniya opens a TV room for tonight's open night; one room at a time,
--     a 6-letter code, expires at night's end (06:00 Kuwait), revocable, a new code rotates the old one,
--     6 codes a night at most;
-- (2) tv_state(code) runs for anyone (the TV never signs in) and returns only public scoreboard data:
--     names, scores, the season table, the monthly crown, head-to-head and tonight's draw; no ids,
--     no emails, no birth dates, no areas of people; unknown, revoked, expired or closed = no data;
-- (3) wrong codes are rate-limited per client IP (10 in 10 minutes), a known code per room (60 a minute);
-- (4) Tonight's draw: managers only, fair server-side shuffle of 2-36 unique names into tonight's
--     tables and seats (teams by seat), the rest wait; 20 draws a night;
-- (5) night_card(diwaniya) for the managers and anyone at that night, nobody else, never anon;
-- (6) the TV tables are not readable by anon or authenticated.
-- Written before the migration (red on 9a199fe: function public.tv_open(uuid) does not exist), applied on dev as 20261118184831.
-- One transaction that always rolls back. Run: python3 scripts/sql_test.py supabase/tests/tv_room_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-tv-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000007a1',  -- H host of D
  '00000000-0000-4000-8000-0000000007a2',  -- G guest, checked in at D tonight
  '00000000-0000-4000-8000-0000000007a3',  -- S stranger
  '00000000-0000-4000-8000-0000000007a4'   -- C accepted co-host of D
]) u;

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.anon(ip text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true),
         set_config('request.headers', json_build_object('cf-connecting-ip', ip)::text, true)
$$;
create function pg_temp.close_night(n uuid) returns void language sql security definer as $$
  update public.nights set status = 'closed' where id = n
$$;
create function pg_temp.accept_cohost(d uuid, u uuid) returns void language sql security definer as $$
  update public.cohosts set accepted_at = now() where diwaniya_id = d and user_id = u
$$;
create function pg_temp.expire_rooms(n uuid) returns void language plpgsql security definer as $$
begin update private.tv_rooms set expires_at = now() - interval '1 second' where night_id = n; end
$$;
create function pg_temp.reset_window(c text) returns void language plpgsql security definer as $$
begin update private.tv_rooms set win_calls = 0 where code = c; end
$$;
create function pg_temp.room_expiry(c text) returns timestamptz language plpgsql security definer as $$
begin return (select expires_at from private.tv_rooms where code = c); end
$$;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000007a1'; G uuid := '00000000-0000-4000-8000-0000000007a2';
  S uuid := '00000000-0000-4000-8000-0000000007a3'; C uuid := '00000000-0000-4000-8000-0000000007a4';
  u uuid; v_q uuid; v_d uuid; v_n uuid; v_t uuid; v_t2 uuid; v_sheet uuid; v_j jsonb; v_s jsonb; v_code text; v_code2 text;
  v_txt text; v_cnt int; v_names text[]; v_exp timestamptz; i int;
begin
  foreach u in array array[H, G, S, C] loop
    perform pg_temp.act(u);
    perform public.complete_profile('TV' || right(u::text, 2), 'الخيران', date '1990-01-01', true);
  end loop;
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area, guest_cap) values (H, 'Diwaniya TV Test', 'الخيران', 10) returning id into v_d;
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() - interval '10 minutes') returning id into v_n;
  insert into public.game_tables (night_id, game, seat_count, label) values (v_n, 'kout', 4, 'Table A') returning id into v_t;
  insert into public.game_tables (night_id, game, seat_count, label) values (v_n, 'trix', 4, 'Table B') returning id into v_t2;
  insert into public.cohosts (diwaniya_id, user_id) values (v_d, C);
  reset role; perform pg_temp.accept_cohost(v_d, C); set local role authenticated;
  -- G checks in tonight, then an earlier game of the season
  perform pg_temp.act(G); v_q := public.request_seat(v_n, v_t, 0, '', true);
  perform pg_temp.act(H); perform public.decide_request(v_q, true);
  perform pg_temp.act(G); perform public.check_in(v_t, 1);
  perform pg_temp.act(H);
  perform public.record_game(v_d, 'kout_bo4', null, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', G, 'name', 'TVa2', 'team', 1, 'points', 6, 'won', true),
    jsonb_build_object('seat', 2, 'user_id', H, 'name', 'TVa1', 'team', 2, 'points', 2, 'won', false),
    jsonb_build_object('seat', 3, 'user_id', null, 'name', 'Abu Fahad', 'team', 1, 'points', 6, 'won', true),
    jsonb_build_object('seat', 4, 'user_id', null, 'name', 'Walk-in', 'team', 2, 'points', 2, 'won', false)));

  -- (1) strangers, guests and anon cannot open a room
  foreach u in array array[S, G] loop
    perform pg_temp.act(u);
    begin perform public.tv_open(v_n); raise exception 'FAIL: (1) % opened a TV room', u;
    exception when sqlstate '42501' then null; end;
  end loop;
  -- the host opens one: 6 letters from the safe alphabet, expires at the next 06:00 Kuwait
  perform pg_temp.act(H);
  v_j := public.tv_open(v_n);
  v_code := v_j->>'code';
  if v_code !~ '^[ACDEFHJKLMNPRTUVWXY3479]{6}$' then raise exception 'FAIL: (1) code % is not 6 safe letters', v_code; end if;
  reset role; v_exp := pg_temp.room_expiry(v_code); set local role authenticated;
  if v_exp <= now() or v_exp > now() + interval '24 hours'
     or to_char(v_exp at time zone 'Asia/Kuwait', 'HH24:MI') <> '06:00' then
    raise exception 'FAIL: (1) room expires at % (want the next 06:00 Kuwait)', v_exp; end if;
  -- opening again shows the same room; the co-host sees it too
  if public.tv_open(v_n)->>'code' <> v_code then raise exception 'FAIL: (1) second open made a new code'; end if;
  perform pg_temp.act(C);
  if public.tv_current(v_n)->>'code' <> v_code then raise exception 'FAIL: (1) co-host does not see the room'; end if;
  perform pg_temp.act(S);
  begin perform public.tv_current(v_n); raise exception 'FAIL: (1) stranger read the room code';
  exception when sqlstate '42501' then null; end;

  -- (5) live score: G scores his table; (2) the TV sees it with names only
  perform pg_temp.act(G);
  v_sheet := public.start_score(v_d, 'kout_bo4', v_t, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', G, 'team', 1),
    jsonb_build_object('seat', 2, 'user_id', H, 'team', 2),
    jsonb_build_object('seat', 3, 'name', 'Abu Fahad', 'team', 1),
    jsonb_build_object('seat', 4, 'name', 'Walk-in', 'team', 2)));
  perform public.add_round(v_sheet, array[3, 0]);
  perform public.add_round(v_sheet, array[0, 2]);

  -- (2) anyone with the code, signed out
  set local role anon; perform pg_temp.anon('203.0.113.7');
  v_s := public.tv_state(' ' || lower(v_code) || ' ');
  if v_s->>'status' <> 'live' then raise exception 'FAIL: (2) TV state %', v_s->>'status'; end if;
  if v_s->'diwaniya'->>'name' <> 'Diwaniya TV Test' then raise exception 'FAIL: (2) no diwaniya name'; end if;
  if v_s->>'topic' !~ '^tv:[0-9a-f]{32}$' then raise exception 'FAIL: (2) no broadcast topic'; end if;
  v_txt := v_s::text;
  if v_txt ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
    raise exception 'FAIL: (2) the TV state carries an id: %', left(v_txt, 400); end if;
  if v_txt ~* '(@example|1990-01-01|birth|email|host_id|user_id|started_by|recorded_by)' then
    raise exception 'FAIL: (2) the TV state carries private data: %', left(v_txt, 400); end if;
  if jsonb_array_length(v_s->'tables') <> 2 or v_s->'tables'->0->'seats'->0->>'name' <> 'TVa2' then
    raise exception 'FAIL: (2) tables/seats wrong: %', v_s->'tables'; end if;
  if jsonb_array_length(v_s->'live') <> 1 or v_s->'live'->0->'totals' <> '[3, 2]'::jsonb
     or (v_s->'live'->0->>'rounds')::int <> 2 then
    raise exception 'FAIL: (2) live score wrong: %', v_s->'live'; end if;
  if v_s->'live'->0->'h2h'->>'a' <> 'TVa2' or v_s->'live'->0->'h2h'->>'b' <> 'TVa1'
     or (v_s->'live'->0->'h2h'->>'a_wins')::int <> 1 or (v_s->'live'->0->'h2h'->>'b_wins')::int <> 0 then
    raise exception 'FAIL: (2) head-to-head wrong: %', v_s->'live'->0->'h2h'; end if;
  if v_s->'season'->0->>'name' not in ('TVa2', 'Abu Fahad') or (v_s->'season'->0->>'wins')::int <> 1 then
    raise exception 'FAIL: (2) season table wrong: %', v_s->'season'; end if;
  if not (v_s->'crown' ? 'TVa2') then raise exception 'FAIL: (2) monthly crown wrong: %', v_s->'crown'; end if;

  -- (3) wrong codes: 10 per IP in 10 minutes, then refused; another IP is not affected
  for i in 1..10 loop
    if public.tv_state('XXXXX' || i)->>'status' <> 'unknown' then raise exception 'FAIL: (3) wrong code % answered', i; end if;
  end loop;
  begin perform public.tv_state('AAAAAA'); raise exception 'FAIL: (3) 11th wrong code from one IP not refused';
  exception when sqlstate '54000' then null; end;
  begin perform public.tv_state(v_code); raise exception 'FAIL: (3) a blocked IP still reads a room';
  exception when sqlstate '54000' then null; end;
  perform pg_temp.anon('198.51.100.9');
  if public.tv_state(v_code)->>'status' <> 'live' then raise exception 'FAIL: (3) another IP was blocked'; end if;
  -- a known code: 60 reads a minute per room, then refused
  for i in 1..58 loop perform public.tv_state(v_code); end loop;  -- 2 reads above + 58 = 60
  begin perform public.tv_state(v_code); raise exception 'FAIL: (3) more than 60 reads a minute allowed';
  exception when sqlstate '54000' then null; end;
  set local role authenticated; reset role; perform pg_temp.reset_window(v_code); set local role anon;

  -- (6) the TV tables stay closed
  begin select count(*) into v_cnt from private.tv_rooms; raise exception 'FAIL: (6) anon reads tv_rooms';
  exception when sqlstate '42501' then null; end;
  begin perform public.tv_open(v_n); raise exception 'FAIL: (6) anon opened a room';
  exception when sqlstate '42501' then null; end;
  begin perform public.tv_draw(v_n, array['a', 'b']); raise exception 'FAIL: (6) anon drew';
  exception when sqlstate '42501' then null; end;
  begin perform public.night_card(v_d); raise exception 'FAIL: (6) anon read a night card';
  exception when sqlstate '42501' then null; end;
  set local role authenticated;
  perform pg_temp.act(S);
  begin select count(*) into v_cnt from private.tv_rooms; raise exception 'FAIL: (6) a user reads tv_rooms';
  exception when sqlstate '42501' then null; end;

  -- (4) Tonight's draw
  perform pg_temp.act(S);
  begin perform public.tv_draw(v_n, array['a', 'b', 'c', 'd']); raise exception 'FAIL: (4) stranger drew';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(G);
  begin perform public.tv_draw(v_n, array['a', 'b', 'c', 'd']); raise exception 'FAIL: (4) guest drew';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(H);
  begin perform public.tv_draw(v_n, array['Ali']); raise exception 'FAIL: (4) one-name draw';
  exception when sqlstate '22023' then null; end;
  begin perform public.tv_draw(v_n, array['Ali', ' ali ']); raise exception 'FAIL: (4) duplicate names drawn';
  exception when sqlstate '22023' then null; end;
  begin perform public.tv_draw(v_n, array['Ali', '']); raise exception 'FAIL: (4) empty name drawn';
  exception when sqlstate '22023' then null; end;
  v_names := array['Ali', 'Bader', 'Fahad', 'Hamad', 'Jasem', 'Khaled', 'Mishal', 'Nasser', 'Omar'];
  v_j := public.tv_draw(v_n, v_names);
  -- every name exactly once, 8 seated on the two 4-seat tables, 1 waiting
  select count(*) into v_cnt from (
    select st->>'name' as n from jsonb_array_elements(v_j->'tables') tb, jsonb_array_elements(tb->'seats') st
    union all select w from jsonb_array_elements_text(v_j->'waiting') w) x;
  if v_cnt <> 9 then raise exception 'FAIL: (4) draw placed % names, want 9', v_cnt; end if;
  if (select count(distinct n) from (
        select st->>'name' as n from jsonb_array_elements(v_j->'tables') tb, jsonb_array_elements(tb->'seats') st
        union all select w from jsonb_array_elements_text(v_j->'waiting') w) x
      where n = any(v_names)) <> 9 then raise exception 'FAIL: (4) draw lost or invented a name: %', v_j; end if;
  if jsonb_array_length(v_j->'waiting') <> 1 then raise exception 'FAIL: (4) waiting list %', v_j->'waiting'; end if;
  -- kout: seats 1 and 3 are one team, 2 and 4 the other; trix plays alone (team = seat)
  if exists (select 1 from jsonb_array_elements(v_j->'tables') tb, jsonb_array_elements(tb->'seats') st
             where tb->>'game' = 'kout' and (st->>'team')::int <> 2 - (st->>'seat')::int % 2) then
    raise exception 'FAIL: (4) kout teams wrong: %', v_j; end if;
  if exists (select 1 from jsonb_array_elements(v_j->'tables') tb, jsonb_array_elements(tb->'seats') st
             where tb->>'game' = 'trix' and (st->>'team')::int <> (st->>'seat')::int) then
    raise exception 'FAIL: (4) trix seats wrong: %', v_j; end if;
  if (v_j->>'no')::int <> 1 then raise exception 'FAIL: (4) first draw numbered %', v_j->>'no'; end if;
  perform pg_temp.act(C);
  v_j := public.tv_draw(v_n, v_names);
  if (v_j->>'no')::int <> 2 then raise exception 'FAIL: (4) co-host draw numbered %', v_j->>'no'; end if;
  -- the TV shows the latest draw
  set local role anon; perform pg_temp.anon('192.0.2.44');
  v_s := public.tv_state(v_code);
  if (v_s->'draw'->>'no')::int <> 2 then raise exception 'FAIL: (4) TV shows draw %', v_s->'draw'->>'no'; end if;
  set local role authenticated;
  perform pg_temp.act(H);
  select count(distinct first_name) into v_cnt from (
    select public.tv_draw(v_n, v_names)->'tables'->0->'seats'->0->>'name' as first_name from generate_series(1, 18)) x;
  if v_cnt < 2 then raise exception 'FAIL: (4) 18 draws put the same name first every time'; end if;
  begin perform public.tv_draw(v_n, v_names); raise exception 'FAIL: (4) 21st draw of the night allowed';
  exception when sqlstate '54000' then null; end;

  -- (5) the night card: managers and people at the night, nobody else
  perform pg_temp.act(H);
  v_j := public.night_card(v_d);
  if v_j is null or v_j->>'name' <> 'Diwaniya TV Test' then raise exception 'FAIL: (5) host has no night card'; end if;
  perform pg_temp.act(G);
  v_j := public.night_card(v_d);
  if v_j is null then raise exception 'FAIL: (5) checked-in guest has no night card'; end if;
  if v_j::text ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
    raise exception 'FAIL: (5) night card carries an id'; end if;
  perform pg_temp.act(S);
  if public.night_card(v_d) is not null then raise exception 'FAIL: (5) stranger got a night card'; end if;

  -- (1) revoke: the code stops at once, carries no data, and a new code is different
  perform pg_temp.act(G);
  begin perform public.tv_revoke(v_n); raise exception 'FAIL: (1) guest revoked the room';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(H);
  perform public.tv_revoke(v_n);
  set local role anon; perform pg_temp.anon('192.0.2.45');
  v_s := public.tv_state(v_code);
  if v_s->>'status' <> 'ended' or v_s ? 'tables' or v_s ? 'topic' then raise exception 'FAIL: (1) revoked code still shows %', v_s; end if;
  set local role authenticated;
  perform pg_temp.act(H);
  if public.tv_current(v_n) is not null then raise exception 'FAIL: (1) revoked room still current'; end if;
  v_code2 := public.tv_open(v_n)->>'code';
  if v_code2 = v_code then raise exception 'FAIL: (1) new room reused the revoked code'; end if;
  -- a new code rotates the old one
  v_code := public.tv_new_code(v_n)->>'code';
  set local role anon; perform pg_temp.anon('192.0.2.46');
  if public.tv_state(v_code2)->>'status' <> 'ended' then raise exception 'FAIL: (1) rotated code still live'; end if;
  if public.tv_state(v_code)->>'status' <> 'live' then raise exception 'FAIL: (1) new code not live'; end if;
  set local role authenticated;
  -- 6 codes a night: 3 used, 3 more, then refused
  perform pg_temp.act(H);
  perform public.tv_new_code(v_n); perform public.tv_new_code(v_n); v_code := public.tv_new_code(v_n)->>'code';
  begin perform public.tv_new_code(v_n); raise exception 'FAIL: (1) seventh code of the night allowed';
  exception when sqlstate '54000' then null; end;

  -- (1) expiry and the night's close end the room
  reset role; perform pg_temp.expire_rooms(v_n); set local role anon; perform pg_temp.anon('192.0.2.47');
  if public.tv_state(v_code)->>'status' <> 'ended' then raise exception 'FAIL: (1) expired code still live'; end if;
  set local role authenticated;
  reset role; perform pg_temp.close_night(v_n); set local role authenticated;
  perform pg_temp.act(H);
  begin perform public.tv_open(v_n); raise exception 'FAIL: (1) room opened on a closed night';
  exception when sqlstate '22023' then null; end;
  -- the night card stays for the people who were there once the night is closed
  perform pg_temp.act(G);
  if public.night_card(v_d) is null then raise exception 'FAIL: (5) night card gone after the close'; end if;
end $$;
reset role;

select 'tv_room_test green' as result;
rollback;
