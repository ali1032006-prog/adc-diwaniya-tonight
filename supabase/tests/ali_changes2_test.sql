-- Ali's change list 2 (ADC-LOG-764, migration *_ali_change_list_2.sql):
-- (2) the host writes an address with the pin; it is read exactly like the pin: managers, and
--     approved guests from the unlock time; a pending guest, a stranger or anyone before the
--     unlock time sees nothing (the area only).
-- (3) live scoring: a score sheet per game, rounds saved as they are played, undo per round,
--     finish sends the totals to the league; the same who-may-score rule as record_game.
-- Written before the migration (red on a7d3371: column "address" does not exist), applied on dev as 20261118104830.
-- One transaction that always rolls back. Run: python3 scripts/sql_test.py supabase/tests/ali_changes2_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-ali2-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000d1',  -- H host of D (and of L, a night that unlocks later)
  '00000000-0000-4000-8000-0000000000d2',  -- G guest, approved and checked in at D tonight
  '00000000-0000-4000-8000-0000000000d3',  -- P approved at D tonight, never checks in
  '00000000-0000-4000-8000-0000000000d4',  -- Q pending at D tonight
  '00000000-0000-4000-8000-0000000000d5',  -- R regular of D
  '00000000-0000-4000-8000-0000000000d6',  -- S stranger
  '00000000-0000-4000-8000-0000000000d7'   -- A approved at L, before its unlock time
]) u;

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.close_night(n uuid) returns void language sql security definer as $$
  update public.nights set status = 'closed' where id = n
$$;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000000d1'; G uuid := '00000000-0000-4000-8000-0000000000d2';
  P uuid := '00000000-0000-4000-8000-0000000000d3'; Q uuid := '00000000-0000-4000-8000-0000000000d4';
  R uuid := '00000000-0000-4000-8000-0000000000d5'; S uuid := '00000000-0000-4000-8000-0000000000d6';
  A uuid := '00000000-0000-4000-8000-0000000000d7';
  u uuid; v_d uuid; v_l uuid; v_n uuid; v_nl uuid; v_t uuid; v_t2 uuid; v_tl uuid; v_q uuid;
  v_sheet uuid; v_sheet2 uuid; v_game uuid; v_round int; v_cnt int; v_txt text; v_players jsonb;
begin
  foreach u in array array[H, G, P, Q, R, S, A] loop
    perform pg_temp.act(u);
    perform public.complete_profile('AT' || right(u::text, 2), 'الخيران', date '1990-01-01', true);
  end loop;
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area, guest_cap) values (H, 'Diwaniya Ali2 Test', 'الخيران', 10) returning id into v_d;
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() - interval '10 minutes') returning id into v_n;
  insert into public.game_tables (night_id, game, seat_count) values (v_n, 'kout', 4) returning id into v_t;
  insert into public.game_tables (night_id, game, seat_count) values (v_n, 'trix', 4) returning id into v_t2;
  insert into public.regulars (diwaniya_id, user_id) values (v_d, R);
  -- L: tonight's night starts in five hours, the pin unlocks an hour before
  insert into public.diwaniyas (host_id, name, area) values (H, 'Later Ali2 Test', 'الخيران') returning id into v_l;
  insert into public.nights (diwaniya_id, starts_at) values (v_l, now() + interval '5 hours') returning id into v_nl;
  insert into public.game_tables (night_id, game, seat_count) values (v_nl, 'baloot', 4) returning id into v_tl;

  -- (2) the host writes the address with the pin
  insert into public.diwaniya_pins (diwaniya_id, lat, lng, directions, address)
    values (v_d, 29.33750, 47.98000, 'Gate 2', 'Khairan, Block 3, Street 12, House 7');
  insert into public.diwaniya_pins (diwaniya_id, lat, lng, address) values (v_l, 29.30000, 47.90000, 'Later address');
  begin update public.diwaniya_pins set address = repeat('x', 201) where diwaniya_id = v_d;
    raise exception 'FAIL: (2) address over 200 characters accepted';
  exception when check_violation then null; end;
  begin update public.diwaniya_pins set address = 'line' || chr(7) where diwaniya_id = v_d;
    raise exception 'FAIL: (2) control character in the address accepted';
  exception when check_violation then null; end;

  foreach u in array array[G, P, Q] loop
    perform pg_temp.act(u);
    v_q := public.request_seat(v_n, v_t, 0, '', true);
    if u <> Q then perform pg_temp.act(H); perform public.decide_request(v_q, true); end if;
  end loop;
  perform pg_temp.act(A);
  v_q := public.request_seat(v_nl, v_tl, 0, '', true);
  perform pg_temp.act(H); perform public.decide_request(v_q, true);
  perform pg_temp.act(G); perform public.check_in(v_t, 1);

  -- nobody but the host writes it (RLS: the update touches no row)
  perform pg_temp.act(G);
  update public.diwaniya_pins set address = 'hijacked' where diwaniya_id = v_d;
  perform pg_temp.act(H);
  if (select address from public.diwaniya_pins where diwaniya_id = v_d) <> 'Khairan, Block 3, Street 12, House 7' then
    raise exception 'FAIL: (2) a guest changed the address'; end if;

  -- approved guests (checked in or not) read it after the unlock time
  foreach u in array array[G, P] loop
    perform pg_temp.act(u);
    select address into v_txt from public.diwaniya_pins where diwaniya_id = v_d;
    if v_txt is distinct from 'Khairan, Block 3, Street 12, House 7' then
      raise exception 'FAIL: (2) approved guest % does not see the address', u; end if;
  end loop;
  -- a pending guest and a stranger: nothing
  foreach u in array array[Q, S] loop
    perform pg_temp.act(u);
    select count(*) into v_cnt from public.diwaniya_pins where diwaniya_id = v_d;
    if v_cnt <> 0 then raise exception 'FAIL: (2) % sees the address without approval', u; end if;
  end loop;
  -- approved at L, but before its unlock time: nothing yet
  perform pg_temp.act(A);
  select count(*) into v_cnt from public.diwaniya_pins where diwaniya_id = v_l;
  if v_cnt <> 0 then raise exception 'FAIL: (2) address shown before the unlock time'; end if;

  -- (3) live scoring: G (checked in) opens a sheet for his table
  perform pg_temp.act(G);
  v_players := jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', G, 'team', 1),
    jsonb_build_object('seat', 2, 'user_id', H, 'team', 2),
    jsonb_build_object('seat', 3, 'name', 'Abu Fahad', 'team', 1),
    jsonb_build_object('seat', 4, 'name', 'Walk-in', 'team', 2));
  v_sheet := public.start_score(v_d, 'kout_bo4', v_t, v_players);
  -- one open sheet per table
  perform pg_temp.act(H);
  begin perform public.start_score(v_d, 'kout_bo4', v_t, v_players);
    raise exception 'FAIL: (3) second open sheet on the same table';
  exception when sqlstate '23505' then null; end;
  -- rounds are saved as they go; everyone who may score the table sees the same sheet
  perform pg_temp.act(G);
  v_round := public.add_round(v_sheet, array[5, 0]);
  if v_round <> 1 then raise exception 'FAIL: (3) first round numbered %', v_round; end if;
  perform pg_temp.act(H);
  perform public.add_round(v_sheet, array[0, 12]);
  perform public.add_round(v_sheet, array[7, 0]);
  perform pg_temp.act(G);
  select count(*) into v_cnt from public.score_rounds where sheet_id = v_sheet and undone_at is null;
  if v_cnt <> 3 then raise exception 'FAIL: (3) guest sees % rounds, want 3', v_cnt; end if;
  -- wrong shapes are refused
  begin perform public.add_round(v_sheet, array[1, 2, 3]);
    raise exception 'FAIL: (3) three numbers for a two-team game';
  exception when sqlstate '22023' then null; end;
  begin perform public.add_round(v_sheet, array[5000, 0]);
    raise exception 'FAIL: (3) round points out of range';
  exception when sqlstate '22023' then null; end;
  -- undo one round (the second), the running total drops it
  perform public.undo_round(v_sheet, 2);
  if (select coalesce(sum(points[2]), 0) from public.score_rounds where sheet_id = v_sheet and undone_at is null) <> 0 then
    raise exception 'FAIL: (3) undone round still counts'; end if;
  begin perform public.undo_round(v_sheet, 9); raise exception 'FAIL: (3) undo of a round that does not exist';
  exception when sqlstate 'P0002' then null; end;

  -- who may score: the approved guest who never checked in, the pending guest and a stranger can't
  -- read or write the sheet
  foreach u in array array[P, Q, S] loop
    perform pg_temp.act(u);
    select count(*) into v_cnt from public.score_sheets where id = v_sheet;
    if v_cnt <> 0 then raise exception 'FAIL: (3) % reads the sheet', u; end if;
    select count(*) into v_cnt from public.score_rounds where sheet_id = v_sheet;
    if v_cnt <> 0 then raise exception 'FAIL: (3) % reads the rounds', u; end if;
    begin perform public.add_round(v_sheet, array[1, 0]); raise exception 'FAIL: (3) % added a round', u;
    exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
    begin perform public.start_score(v_d, 'trix', v_t2, jsonb_build_array(
        jsonb_build_object('seat', 1, 'name', 'a', 'team', 1), jsonb_build_object('seat', 2, 'name', 'b', 'team', 2)));
      raise exception 'FAIL: (3) % opened a sheet', u;
    exception when sqlstate '42501' then null; end;
  end loop;
  -- direct writes are closed: rounds only through the functions
  perform pg_temp.act(G);
  begin insert into public.score_rounds (sheet_id, round_no, points, added_by) values (v_sheet, 50, array[99, 0], G);
    raise exception 'FAIL: (3) direct insert into score_rounds';
  exception when insufficient_privilege then null; end;
  begin update public.score_sheets set status = 'finished' where id = v_sheet;
    raise exception 'FAIL: (3) direct update of a sheet';
  exception when insufficient_privilege then null; end;
  -- a player who was not there can't be seated
  begin perform public.start_score(v_d, 'trix', v_t2, jsonb_build_array(
      jsonb_build_object('seat', 1, 'user_id', G, 'team', 1), jsonb_build_object('seat', 2, 'user_id', S, 'team', 2)));
    raise exception 'FAIL: (3) stranger seated on a sheet';
  exception when sqlstate '22023' then null; end;
  -- ...nor one person twice
  begin perform public.start_score(v_d, 'trix', v_t2, jsonb_build_array(
      jsonb_build_object('seat', 1, 'user_id', G, 'team', 1), jsonb_build_object('seat', 2, 'user_id', G, 'team', 2)));
    raise exception 'FAIL: (3) same player twice on a sheet';
  exception when sqlstate '22023' then null; end;
  -- the winner must be one of the teams
  begin perform public.finish_score(v_sheet, 3::smallint); raise exception 'FAIL: (3) winner team 3 of 2';
  exception when sqlstate '22023' then null; end;

  -- finish: the totals (12 to 0 after the undo) go to the league as one game
  v_game := public.finish_score(v_sheet, 1::smallint);
  if (select status from public.score_sheets where id = v_sheet) <> 'finished'
     or (select game_id from public.score_sheets where id = v_sheet) is distinct from v_game then
    raise exception 'FAIL: (3) sheet not marked finished with its game'; end if;
  if (select points from public.game_results where game_id = v_game and seat = 1) <> 12
     or (select points from public.game_results where game_id = v_game and seat = 2) <> 0 then
    raise exception 'FAIL: (3) league game does not carry the running totals'; end if;
  if (select wins from public.league_standings where diwaniya_id = v_d and user_id = G) <> 1 then
    raise exception 'FAIL: (3) finished sheet did not reach the league'; end if;
  -- a finished sheet takes no more rounds and can't be finished twice
  begin perform public.add_round(v_sheet, array[1, 0]); raise exception 'FAIL: (3) round on a finished sheet';
  exception when sqlstate '22023' then null; end;
  begin perform public.finish_score(v_sheet, 1::smallint); raise exception 'FAIL: (3) sheet finished twice';
  exception when sqlstate '22023' then null; end;
  -- the table is free for the next game
  v_sheet2 := public.start_score(v_d, 'kout_bo4', v_t, v_players);
  perform public.discard_score(v_sheet2);
  if (select status from public.score_sheets where id = v_sheet2) <> 'discarded' then
    raise exception 'FAIL: (3) discard did not close the sheet'; end if;
  -- an empty sheet can't be sent to the league
  v_sheet2 := public.start_score(v_d, 'kout_bo4', v_t, v_players);
  begin perform public.finish_score(v_sheet2, 1::smallint); raise exception 'FAIL: (3) finished with no rounds';
  exception when sqlstate '22023' then null; end;

  -- the regular keeps his own table-less sheet, invisible to the guest
  perform pg_temp.act(R);
  v_sheet := public.start_score(v_d, 'trix', null, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', R, 'team', 1), jsonb_build_object('seat', 2, 'name', 'Walk-in', 'team', 2),
    jsonb_build_object('seat', 3, 'name', 'Second', 'team', 3), jsonb_build_object('seat', 4, 'name', 'Third', 'team', 4)));
  perform public.add_round(v_sheet, array[-75, 200, -25, -100]);
  perform pg_temp.act(G);
  select count(*) into v_cnt from public.score_sheets where id = v_sheet;
  if v_cnt <> 0 then raise exception 'FAIL: (3) guest reads a table-less sheet'; end if;

  -- once the night closes the guest is no longer checked in: his table's sheet is shut to him
  reset role; perform pg_temp.close_night(v_n); set local role authenticated;
  perform pg_temp.act(G);
  begin perform public.add_round(v_sheet2, array[1, 0]); raise exception 'FAIL: (3) guest scored after the night closed';
  exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  -- the host still can
  perform pg_temp.act(H);
  perform public.add_round(v_sheet2, array[1, 0]);
end $$;
reset role;

select 'ali_changes2_test green' as result;
rollback;
