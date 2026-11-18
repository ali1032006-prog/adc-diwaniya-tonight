-- Ali's change list (ADC-LOG-754, migration *_ali_change_list.sql), one block per item:
-- (1) areas come from the Kuwait list, (3) every scored game reaches the league, (4) guests checked in
-- at a diwaniya tonight may score its tables and nothing else, (5) the pin sits inside Kuwait,
-- (6) my_diwaniyas() lists followed, regular and visited diwaniyas with tonight's status.
-- Written before the migration: blocks 1, 3, 4 and 6 failed on 80a680f for the item's own reason.
-- One transaction that always rolls back. Run: python3 scripts/sql_test.py supabase/tests/ali_changes_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-ali-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000f1',  -- H host of D
  '00000000-0000-4000-8000-0000000000f2',  -- G guest, checks in at D tonight
  '00000000-0000-4000-8000-0000000000f3',  -- P approved at D tonight, never checks in
  '00000000-0000-4000-8000-0000000000f4',  -- R regular of D
  '00000000-0000-4000-8000-0000000000f5',  -- E host of another diwaniya
  '00000000-0000-4000-8000-0000000000f6',  -- B checks in, then the host blocks him
  '00000000-0000-4000-8000-0000000000f7',  -- Z checks in, then gets hidden
  '00000000-0000-4000-8000-0000000000f8'   -- S stranger
]) u;

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
-- Owner-side helper: an admin hiding a person (the moderation RPCs are tested in v1_complete_test).
create function pg_temp.hide(u uuid) returns void language sql security definer as $$
  update public.profiles set hidden_at = now() where id = u
$$;
create function pg_temp.close_night(n uuid) returns void language sql security definer as $$
  update public.nights set status = 'closed' where id = n
$$;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000000f1'; G uuid := '00000000-0000-4000-8000-0000000000f2';
  P uuid := '00000000-0000-4000-8000-0000000000f3'; R uuid := '00000000-0000-4000-8000-0000000000f4';
  E uuid := '00000000-0000-4000-8000-0000000000f5'; B uuid := '00000000-0000-4000-8000-0000000000f6';
  Z uuid := '00000000-0000-4000-8000-0000000000f7'; S uuid := '00000000-0000-4000-8000-0000000000f8';
  u uuid; v_d uuid; v_e uuid; v_n uuid; v_ne uuid; v_t uuid; v_t2 uuid; v_te uuid; v_q uuid;
  v_game uuid; v_cnt int; v_j jsonb; v_row jsonb;
begin
  -- (1) areas: only names from the Kuwait list, on profiles, diwaniyas and ping areas
  perform pg_temp.act(S);
  begin perform public.complete_profile('Ali Test', 'Atlantis', date '1990-01-01', true);
    raise exception 'FAIL: (1) profile area outside the Kuwait list accepted';
  exception when sqlstate '22023' then null; end;
  foreach u in array array[H, G, P, R, E, B, Z, S] loop
    perform pg_temp.act(u);
    perform public.complete_profile('AL' || right(u::text, 2), 'الخيران', date '1990-01-01', true);
  end loop;
  if (select count(*) from public.kuwait_areas) < 100 then raise exception 'FAIL: (1) Kuwait area list is short'; end if;
  if (select count(distinct governorate) from public.kuwait_areas) <> 6 then raise exception 'FAIL: (1) not six governorates'; end if;
  perform pg_temp.act(G);
  begin update public.profiles set area = 'Nowhere' where id = G;
    raise exception 'FAIL: (1) profile area changed to a name outside the list';
  exception when sqlstate '22023' then null; end;
  begin update public.profile_private set ping_areas = '{السالمية,Nowhere}' where user_id = G;
    raise exception 'FAIL: (1) ping area outside the list accepted';
  exception when sqlstate '22023' then null; end;
  update public.profile_private set ping_areas = '{" السالمية "}' where user_id = G;
  if (select ping_areas from public.profile_private where user_id = G) <> '{السالمية}' then
    raise exception 'FAIL: (1) ping area not trimmed'; end if;
  -- the English name is mapped to the list's Arabic name
  update public.profiles set area = ' salmiya ' where id = G;
  if (select area from public.profiles where id = G) <> 'السالمية' then raise exception 'FAIL: (1) English area name not mapped'; end if;
  perform pg_temp.act(H);
  begin insert into public.diwaniyas (host_id, name, area) values (H, 'Bad area', 'Nowhere');
    raise exception 'FAIL: (1) diwaniya area outside the list accepted';
  exception when sqlstate '22023' then null; end;
  insert into public.diwaniyas (host_id, name, area, guest_cap) values (H, 'Diwaniya Ali Test', 'الخيران', 10) returning id into v_d;
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() - interval '10 minutes') returning id into v_n;
  insert into public.game_tables (night_id, game, seat_count) values (v_n, 'kout', 6) returning id into v_t;
  insert into public.game_tables (night_id, game, seat_count) values (v_n, 'baloot', 4) returning id into v_t2;
  insert into public.regulars (diwaniya_id, user_id) values (v_d, R);
  perform pg_temp.act(E);
  insert into public.diwaniyas (host_id, name, area) values (E, 'Other Ali Test', 'الخيران') returning id into v_e;
  insert into public.nights (diwaniya_id, starts_at) values (v_e, now() - interval '10 minutes') returning id into v_ne;
  insert into public.game_tables (night_id, game, seat_count) values (v_ne, 'kout', 4) returning id into v_te;

  -- (5) the pin sits inside Kuwait
  perform pg_temp.act(H);
  begin insert into public.diwaniya_pins (diwaniya_id, lat, lng) values (v_d, 51.50000, -0.12000);
    raise exception 'FAIL: (5) pin outside Kuwait accepted';
  exception when check_violation then null; end;
  insert into public.diwaniya_pins (diwaniya_id, lat, lng, directions) values (v_d, 29.33750, 47.98000, 'Gate 2');

  -- guests: G, B, Z request, get approved and check in; P is approved but never checks in
  foreach u in array array[G, P, B, Z] loop
    perform pg_temp.act(u);
    v_q := public.request_seat(v_n, v_t, 0, '', true);
    perform pg_temp.act(H);
    perform public.decide_request(v_q, true);
  end loop;
  perform pg_temp.act(G); perform public.check_in(v_t, 1);
  perform pg_temp.act(B); perform public.check_in(v_t, 2);
  perform pg_temp.act(Z); perform public.check_in(v_t, 3);
  perform pg_temp.act(H); insert into public.seats (table_id, seat_no, user_id) values (v_t, 4, H);

  -- (3) a game scored with typed names (walk-ins, no accounts) reaches the league
  perform pg_temp.act(H);
  v_game := public.record_game(v_d, 'kout_bo4', null, jsonb_build_array(
    jsonb_build_object('seat', 1, 'name', 'Tariq', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 2, 'name', 'Bader', 'team', 2, 'points', 80, 'won', false),
    jsonb_build_object('seat', 3, 'name', ' tariq jr ', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 4, 'user_id', H, 'name', 'x', 'team', 2, 'points', 80, 'won', false)));
  select count(*) into v_cnt from public.league_standings where diwaniya_id = v_d;
  if v_cnt <> 4 then raise exception 'FAIL: (3) scored game shows % league rows, want 4', v_cnt; end if;
  if (select wins from public.league_standings where diwaniya_id = v_d and name = 'Tariq') <> 1 then
    raise exception 'FAIL: (3) walk-in winner has no win in the league'; end if;
  if (select played from public.league_standings where diwaniya_id = v_d and user_id = H) <> 1 then
    raise exception 'FAIL: (3) host not in the league'; end if;
  -- the same walk-in name is one league row across games, whatever the case
  perform public.record_game(v_d, 'kout_bo4', null, jsonb_build_array(
    jsonb_build_object('seat', 1, 'name', 'TARIQ', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 2, 'name', 'Bader', 'team', 2, 'points', 80, 'won', false)));
  if (select played from public.league_standings where diwaniya_id = v_d and player_key = 'guest:tariq') <> 2 then
    raise exception 'FAIL: (3) walk-in games not added up by name'; end if;
  -- one person can't sit twice in one game (Ali's second test game had Tariq at seats 4 and 5)
  begin perform public.record_game(v_d, 'kout_bo4', null, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'Tariq', 'team', 1, 'points', 152, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'tariq', 'team', 2, 'points', 80, 'won', false)));
    raise exception 'FAIL: (3) same walk-in twice in one game';
  exception when sqlstate '22023' then null; end;
  begin perform public.record_game(v_d, 'kout_bo4', null, jsonb_build_array(
      jsonb_build_object('seat', 1, 'user_id', H, 'team', 1, 'points', 152, 'won', true),
      jsonb_build_object('seat', 2, 'user_id', H, 'team', 2, 'points', 80, 'won', false)));
    raise exception 'FAIL: (3) same player twice in one game';
  exception when sqlstate '22023' then null; end;

  -- (4) a guest checked in tonight scores tonight's tables of this diwaniya
  perform pg_temp.act(G);
  v_game := public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', G, 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 2, 'user_id', H, 'team', 2, 'points', 80, 'won', false),
    jsonb_build_object('seat', 3, 'name', 'Abu Fahad', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 4, 'name', 'Walk-in', 'team', 2, 'points', 80, 'won', false)));
  if (select played from public.league_standings where diwaniya_id = v_d and user_id = G) <> 1 then
    raise exception 'FAIL: (4) guest''s game not in the league'; end if;
  -- the roster for his table: seated people with their seats, never a stranger
  v_j := public.score_roster(v_d, v_t);
  if not exists (select 1 from jsonb_array_elements(v_j) el where (el->>'id')::uuid = H and (el->>'seat')::int = 4) then
    raise exception 'FAIL: (4) roster misses the seated host %', v_j; end if;
  if exists (select 1 from jsonb_array_elements(v_j) el where (el->>'id')::uuid = S) then
    raise exception 'FAIL: (4) roster names a stranger'; end if;
  -- ...but only tonight's tables of this diwaniya, always with a table
  begin perform public.record_game(v_d, 'kout_bo4', null, jsonb_build_array(
      jsonb_build_object('seat', 1, 'user_id', G, 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'x', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) guest scored without a table';
  exception when sqlstate '42501' then null; end;
  begin perform public.record_game(v_e, 'kout_bo4', v_te, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) guest scored another diwaniya''s table';
  exception when sqlstate '42501' then null; end;
  begin perform public.record_game(v_d, 'kout_bo4', v_te, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) guest passed another diwaniya''s table under this one';
  exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  begin perform public.score_roster(v_e, v_te); raise exception 'FAIL: (4) roster of a diwaniya he is not at';
  exception when sqlstate '42501' then null; end;
  -- his own table or another table of the same night: both are tonight's tables here
  perform public.record_game(v_d, 'baloot', v_t2, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', G, 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 2, 'name', 'Walk-in', 'team', 2, 'points', 80, 'won', false)));
  -- approved but not checked in: no
  perform pg_temp.act(P);
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) approved guest who never checked in scored';
  exception when sqlstate '42501' then null; end;
  -- a stranger: no
  perform pg_temp.act(S);
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) stranger scored';
  exception when sqlstate '42501' then null; end;
  -- checked in, then blocked by the host: no (his seat goes with the block, ADC-SEC-18)
  perform pg_temp.act(H);
  insert into public.blocks (blocker_id, blocked_id) values (H, B);
  perform pg_temp.act(B);
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) blocked guest scored';
  exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  -- checked in, then hidden by an admin: no
  reset role; perform pg_temp.hide(Z); set local role authenticated;
  perform pg_temp.act(Z);
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) hidden guest scored';
  exception when sqlstate '42501' then null; end;
  -- the regular still scores without a table
  perform pg_temp.act(R);
  perform public.record_game(v_d, 'trix', null, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', R, 'team', 1, 'points', 10, 'won', true),
    jsonb_build_object('seat', 2, 'name', 'Walk-in', 'team', 2, 'points', 5, 'won', false)));

  -- (6) my_diwaniyas(): G sees D (visited tonight) with its open night, open seats and his status
  perform pg_temp.act(G);
  insert into public.follows (user_id, diwaniya_id) values (G, v_e);
  v_j := public.my_diwaniyas();
  select el into v_row from jsonb_array_elements(v_j) el where (el->>'id')::uuid = v_d;
  if v_row is null then raise exception 'FAIL: (6) my_diwaniyas misses the diwaniya he is at tonight %', v_j; end if;
  if (v_row->>'night_id')::uuid is distinct from v_n or v_row->>'my_status' <> 'arrived'
     or (v_row->>'open_seats')::int <> 7 or (v_row->>'seated_table')::uuid is distinct from v_t then
    raise exception 'FAIL: (6) tonight''s status wrong %', v_row; end if;
  select el into v_row from jsonb_array_elements(v_j) el where (el->>'id')::uuid = v_e;
  if v_row is null or not (v_row->'why' ? 'follow') or v_row->>'my_status' is not null then
    raise exception 'FAIL: (6) followed diwaniya wrong %', v_row; end if;
  perform pg_temp.act(R);
  select el into v_row from jsonb_array_elements(public.my_diwaniyas()) el where (el->>'id')::uuid = v_d;
  if v_row is null or not (v_row->'why' ? 'regular') then raise exception 'FAIL: (6) regular misses his diwaniya'; end if;
  perform pg_temp.act(S);
  if jsonb_array_length(public.my_diwaniyas()) <> 0 then raise exception 'FAIL: (6) stranger has diwaniyas'; end if;

  -- (4) once the night closes he is no longer checked in: no more scoring, no undo of his game
  reset role; perform pg_temp.close_night(v_n); set local role authenticated;
  perform pg_temp.act(G);
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: (4) guest scored after the night closed';
  exception when sqlstate '42501' then null; end;
  begin perform public.undo_game(v_game); raise exception 'FAIL: (4) guest undid after the night closed';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(H);
  perform public.undo_game(v_game);
  -- G keeps his baloot game; the undone kout game no longer counts
  if (select played from public.league_standings where diwaniya_id = v_d and user_id = G) <> 1 then
    raise exception 'FAIL: (4) undone guest game still counts'; end if;
end $$;
reset role;

select 'ali_changes_test green' as result;
rollback;
