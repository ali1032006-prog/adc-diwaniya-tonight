-- Regression tests for the review round 1/3 findings (supabase/migrations/*_r2_security_fixes.sql):
-- ADC-SEC-16 request/cancel ping flood, ADC-SEC-17 moderation that sticks, ADC-SEC-18 consent for
-- co-hosts / seats / games, ADC-SEC-19 reporters can't read the review, ADC-SEC-20 only linked
-- reporters hold. Each block failed on d8a3d51 (before the fix) for the finding's own reason.
-- One transaction that always rolls back. Run: python3 scripts/sql_test.py supabase/tests/r2_fixes_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-r2-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000e1',  -- H host
  '00000000-0000-4000-8000-0000000000e2',  -- G guest
  '00000000-0000-4000-8000-0000000000e3',  -- A admin
  '00000000-0000-4000-8000-0000000000e4',  -- C co-host to be
  '00000000-0000-4000-8000-0000000000e5',  -- B blocks H
  '00000000-0000-4000-8000-0000000000e6',  -- S1 stranger
  '00000000-0000-4000-8000-0000000000e7',  -- S2 stranger
  '00000000-0000-4000-8000-0000000000e8',  -- S3 stranger
  '00000000-0000-4000-8000-0000000000e9',  -- Z will be hidden, deletes, comes back
  '00000000-0000-4000-8000-0000000000ea'   -- K will be held, tries to delete
]) u;
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values ('r2-google-sub-z', '00000000-0000-4000-8000-0000000000e9', '{"sub":"r2-google-sub-z"}', 'google', now(), now());
insert into private.admins (user_id) values ('00000000-0000-4000-8000-0000000000e3');

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
-- Owner-side peeks (the test runs these outside the authenticated role).
create function pg_temp.inbox_count(u uuid, k text) returns int language sql security definer as $$
  select count(*)::int from public.inbox where user_id = u and kind = k
$$;

set local role authenticated;
do $$
declare
  H uuid := '00000000-0000-4000-8000-0000000000e1'; G uuid := '00000000-0000-4000-8000-0000000000e2';
  A uuid := '00000000-0000-4000-8000-0000000000e3'; C uuid := '00000000-0000-4000-8000-0000000000e4';
  B uuid := '00000000-0000-4000-8000-0000000000e5'; S1 uuid := '00000000-0000-4000-8000-0000000000e6';
  S2 uuid := '00000000-0000-4000-8000-0000000000e7'; S3 uuid := '00000000-0000-4000-8000-0000000000e8';
  Z uuid := '00000000-0000-4000-8000-0000000000e9'; K uuid := '00000000-0000-4000-8000-0000000000ea';
  u uuid; v_d uuid; v_n uuid; v_t uuid; v_q uuid; v_dw uuid[] := '{}'; v_nw uuid; v_rep uuid; v_cnt int; i int;
begin
  foreach u in array array[H, G, A, C, B, S1, S2, S3, Z, K] loop
    perform pg_temp.act(u);
    perform public.complete_profile('R2' || right(u::text, 2), 'السالمية', date '1990-01-01', true);
  end loop;
  perform pg_temp.act(H);
  insert into public.diwaniyas (host_id, name, area, guest_cap) values (H, 'Diwaniya R2 Test', 'الشويخ', 10) returning id into v_d;
  insert into public.nights (diwaniya_id, starts_at) values (v_d, now() + interval '1 hour') returning id into v_n;
  insert into public.game_tables (night_id, game, seat_count) values (v_n, 'kout', 6) returning id into v_t;

  -- ADC-SEC-16 (1): two tries a night, then refused
  perform pg_temp.act(G);
  v_q := public.request_seat(v_n, v_t, 0, '', true); perform public.cancel_request(v_q);
  v_q := public.request_seat(v_n, v_t, 0, '', true); perform public.cancel_request(v_q);
  begin perform public.request_seat(v_n, v_t, 0, '', true); raise exception 'FAIL: SEC-16 third request after two cancels';
  exception when sqlstate '54000' then null; end;
  -- ADC-SEC-16 (2): a cancelled pending request pings nobody; the managers' inbox grew by 2 requests only
  if pg_temp.inbox_count(H, 'cancelled') <> 0 then raise exception 'FAIL: SEC-16 pending cancel pinged the host'; end if;
  if pg_temp.inbox_count(H, 'request') <> 2 then raise exception 'FAIL: SEC-16 host got % request items', pg_temp.inbox_count(H, 'request'); end if;
  -- ADC-SEC-16 (3): five requests in 10 minutes across nights, then refused
  perform pg_temp.act(H);
  for i in 1..4 loop
    insert into public.diwaniyas (host_id, name, area) values (H, 'R2 extra ' || i, 'الشويخ') returning id into v_nw;
    insert into public.nights (diwaniya_id, starts_at) values (v_nw, now() + interval '1 hour') returning id into v_nw;
    v_dw := v_dw || v_nw;
  end loop;
  perform pg_temp.act(S1);
  perform public.request_seat(v_n, null, 0, '', true);
  for i in 1..4 loop perform public.request_seat(v_dw[i], null, 0, '', true); end loop;
  perform pg_temp.act(S1);
  perform public.cancel_request((select id from public.requests where night_id = v_n and user_id = S1));
  begin perform public.request_seat(v_n, null, 0, '', true); raise exception 'FAIL: SEC-16 sixth request in 10 minutes';
  exception when sqlstate '54000' then null; end;

  -- ADC-SEC-18 (1): co-hosts are invited, accept, and can't be anyone who blocked the host
  perform pg_temp.act(B);
  insert into public.blocks (blocker_id, blocked_id) values (B, H);
  perform pg_temp.act(H);
  begin insert into public.cohosts (diwaniya_id, user_id) values (v_d, B); raise exception 'FAIL: SEC-18 made a blocker co-host';
  exception when insufficient_privilege then null; end;
  begin insert into public.cohosts (diwaniya_id, user_id, accepted_at) values (v_d, C, now()); raise exception 'FAIL: SEC-18 host accepted for C';
  exception when insufficient_privilege then null; end;
  insert into public.cohosts (diwaniya_id, user_id) values (v_d, C);
  if pg_temp.inbox_count(C, 'cohost_invite') <> 1 then raise exception 'FAIL: SEC-18 C not told about the invite'; end if;
  perform pg_temp.act(G);
  v_q := (select id from public.requests where night_id = v_n and user_id = G limit 1);
  perform pg_temp.act(C);
  begin insert into public.game_tables (night_id, game, seat_count) values (v_n, 'trix', 4); raise exception 'FAIL: SEC-18 invited (not accepted) co-host managed';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from public.requests where night_id = v_n) then raise exception 'FAIL: SEC-18 invitee reads requests'; end if;
  perform public.accept_cohost(v_d);
  if not exists (select 1 from public.requests where night_id = v_n) then raise exception 'FAIL: SEC-18 accepted co-host can''t read requests'; end if;
  begin perform public.accept_cohost(v_d); raise exception 'FAIL: SEC-18 accepted twice';
  exception when sqlstate 'P0002' then null; end;
  -- a block between host and co-host ends the role
  insert into public.blocks (blocker_id, blocked_id) values (C, H);
  reset role;
  if exists (select 1 from public.cohosts where diwaniya_id = v_d and user_id = C) then raise exception 'FAIL: SEC-18 block kept the co-host row'; end if;
  set local role authenticated;

  -- ADC-SEC-18 (2): managers seat only approved guests (walk-ins by name still fine)
  perform pg_temp.act(S2);
  v_q := public.request_seat(v_n, v_t, 0, '', true);
  perform pg_temp.act(H);
  begin insert into public.seats (table_id, seat_no, user_id) values (v_t, 1, S3); raise exception 'FAIL: SEC-18 seated a stranger';
  exception when insufficient_privilege then null; end;
  begin insert into public.seats (table_id, seat_no, user_id) values (v_t, 1, S2); raise exception 'FAIL: SEC-18 seated a pending guest';
  exception when insufficient_privilege then null; end;
  perform public.decide_request(v_q, true);
  insert into public.seats (table_id, seat_no, user_id) values (v_t, 1, S2);
  insert into public.seats (table_id, seat_no, walk_in_name) values (v_t, 2, 'Abu Fahad');
  begin insert into public.seats (table_id, seat_no, user_id) values (v_t, 3, B); raise exception 'FAIL: SEC-18 seated someone who blocked the host';
  exception when insufficient_privilege then null; end;

  -- ADC-SEC-18 (3): games name only people who were there, never a blocker
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'user_id', H, 'team', 1, 'points', 152, 'won', true),
      jsonb_build_object('seat', 2, 'user_id', S3, 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: SEC-18 game named a stranger';
  exception when sqlstate '22023' then null; end;
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'user_id', H, 'team', 1, 'points', 152, 'won', true),
      jsonb_build_object('seat', 2, 'user_id', B, 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: SEC-18 game named a blocker';
  exception when sqlstate '22023' then null; end;
  perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
    jsonb_build_object('seat', 1, 'user_id', H, 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 2, 'user_id', S2, 'team', 2, 'points', 80, 'won', false),
    jsonb_build_object('seat', 3, 'name', 'Abu Fahad', 'team', 1, 'points', 152, 'won', true),
    jsonb_build_object('seat', 4, 'name', 'Walk-in', 'team', 2, 'points', 80, 'won', false)));

  -- ADC-SEC-20: three reporters with no link to the diwaniya don't hold it
  foreach u in array array[S3, B, Z] loop
    perform pg_temp.act(u);
    if u <> B then insert into public.reports (target_diwaniya, reason) values (v_d, 'fake'); end if;
  end loop;
  perform pg_temp.act(K);
  insert into public.reports (target_diwaniya, reason) values (v_d, 'fake');
  reset role;
  if (select held_at from public.diwaniyas where id = v_d) is not null then raise exception 'FAIL: SEC-20 three unlinked reporters held it'; end if;
  if exists (select 1 from public.reports where target_diwaniya = v_d and counts_to_hold) then raise exception 'FAIL: SEC-20 an unlinked report counts'; end if;
  set local role authenticated;
  -- ... three linked ones do (S2 approved there; G and S1 made regulars), and every admin hears it at once
  perform pg_temp.act(H);
  insert into public.regulars (diwaniya_id, user_id) values (v_d, G), (v_d, S1);
  foreach u in array array[S2, G, S1] loop
    perform pg_temp.act(u);
    insert into public.reports (target_diwaniya, reason) values (v_d, 'safety') returning id into v_rep;
  end loop;
  reset role;
  if (select held_at from public.diwaniyas where id = v_d) is null then raise exception 'FAIL: SEC-20 three linked reporters did not hold it'; end if;
  if pg_temp.inbox_count(A, 'held') <> 1 then raise exception 'FAIL: SEC-20 admin not told about the hold'; end if;
  set local role authenticated;

  -- ADC-SEC-19: the reporter reads his report but not who reviewed it or the admin's note
  perform pg_temp.act(A);
  perform public.admin_review(v_rep, 'dismiss', 'internal: spoke to the host');
  perform pg_temp.act(S1);
  if (select status from public.reports where id = v_rep) <> 'dismissed' then raise exception 'FAIL: SEC-19 reporter lost his report status'; end if;
  begin perform reviewed_by from public.reports where id = v_rep; raise exception 'FAIL: SEC-19 reporter read reviewed_by';
  exception when insufficient_privilege then null; end;
  begin perform review_note from public.reports where id = v_rep; raise exception 'FAIL: SEC-19 reporter read review_note';
  exception when insufficient_privilege then null; end;
  begin perform counts_to_hold from public.reports where id = v_rep; raise exception 'FAIL: reporter read counts_to_hold';
  exception when insufficient_privilege then null; end;
  perform pg_temp.act(A);
  if not exists (select 1 from jsonb_array_elements(public.admin_reports('open')) e where (e->>'counts_to_hold')::boolean) then
    raise exception 'FAIL: SEC-20 queue does not show counts_to_hold'; end if;

  -- ADC-SEC-17 (3): a hidden person can't act anywhere
  perform pg_temp.act(G);
  insert into public.reports (target_user, reason) values (S2, 'harassment') returning id into v_rep;
  perform pg_temp.act(A);
  perform public.admin_review(v_rep, 'hide_user', 'harassed guests');
  perform pg_temp.act(S2);
  begin insert into public.reports (target_user, reason) values (G, 'other'); raise exception 'FAIL: SEC-17 hidden person reported';
  exception when sqlstate '42501' then null; end;
  begin insert into public.follows (user_id, diwaniya_id) values (S2, v_d); raise exception 'FAIL: SEC-17 hidden person followed';
  exception when insufficient_privilege then null; end;
  begin perform public.record_game(v_d, 'kout_bo4', v_t, jsonb_build_array(
      jsonb_build_object('seat', 1, 'name', 'a', 'team', 1, 'points', 1, 'won', true),
      jsonb_build_object('seat', 2, 'name', 'b', 'team', 2, 'points', 0, 'won', false)));
    raise exception 'FAIL: SEC-17 hidden person scored';
  exception when sqlstate '42501' then null; end;
  begin perform public.check_in(v_t, 5); raise exception 'FAIL: SEC-17 hidden person checked in';
  exception when sqlstate '42501' then null; end;
  begin perform public.save_push_subscription('https://fcm.googleapis.com/fcm/send/r2', repeat('B', 87), 'abcdefghabcdefgh');
    raise exception 'FAIL: SEC-17 hidden person saved a push device';
  exception when sqlstate '42501' then null; end;
  perform pg_temp.act(G);
  begin perform public.player_stats(S2); raise exception 'FAIL: SEC-17 stats of a hidden person';
  exception when sqlstate 'P0002' then null; end;
  -- a hidden host (and so a hidden co-host) manages nothing: H hidden, his own night refuses him
  perform pg_temp.act(S1);
  insert into public.reports (target_user, reason) values (H, 'safety') returning id into v_rep;
  perform pg_temp.act(A);
  perform public.admin_review(v_rep, 'hide_user', 'test');
  perform pg_temp.act(H);
  begin perform public.announce(v_n, 'still here'); raise exception 'FAIL: SEC-17 hidden host announced';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.set_need_one(v_t, true); raise exception 'FAIL: SEC-17 hidden host pinged';
  exception when sqlstate 'P0002' then null; end;
  perform pg_temp.act(A);
  perform public.admin_unhide(H, null, '');

  -- ADC-SEC-17 (1): a hidden person deletes his account and signs in again with the same Google
  -- account: the new profile is refused
  perform pg_temp.act(G);
  insert into public.reports (target_user, reason) values (Z, 'fake') returning id into v_rep;
  perform pg_temp.act(A);
  perform public.admin_review(v_rep, 'hide_user', 'fake profile');
  perform pg_temp.act(Z);
  perform public.delete_my_account('DELETE');
  reset role;
  if exists (select 1 from auth.users where id = Z) then raise exception 'FAIL: hidden person could not delete'; end if;
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000eb', 'authenticated', 'authenticated',
            'dt-r2-eb@example.test', now(), now());
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values ('r2-google-sub-z', '00000000-0000-4000-8000-0000000000eb', '{"sub":"r2-google-sub-z"}', 'google', now(), now());
  if exists (select 1 from private.banned_identities where identity_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'FAIL: SEC-17 ban stored something other than a hash'; end if;
  set local role authenticated;
  perform pg_temp.act('00000000-0000-4000-8000-0000000000eb');
  begin perform public.complete_profile('Back again', 'السالمية', date '1990-01-01', true);
    raise exception 'FAIL: SEC-17 hidden person came back clean';
  exception when sqlstate '42501' then null; end;

  -- ADC-SEC-17 (2): a held person can't delete himself out of the review. K is held by three
  -- people who shared a night with him (H ran it, G and S3 were approved there).
  perform pg_temp.act(K);
  perform public.request_seat(v_dw[2], null, 0, '', true);
  perform pg_temp.act(H);
  perform public.decide_request((select id from public.requests where night_id = v_dw[2] and user_id = K), false);
  foreach u in array array[G, S3] loop
    perform pg_temp.act(u);
    begin perform public.request_seat(v_dw[2], null, 0, '', true); exception when sqlstate '54000' then null; end;
  end loop;
  perform pg_temp.act(H);
  for v_q in select id from public.requests where night_id = v_dw[2] and user_id in (G, S3) and status = 'pending' loop
    perform public.decide_request(v_q, true);
  end loop;
  foreach u in array array[H, G, S3] loop
    perform pg_temp.act(u);
    insert into public.reports (target_user, reason) values (K, 'no_show');
  end loop;
  reset role;
  if (select held_at from public.profiles where id = K) is null then raise exception 'FAIL: SEC-20 linked reporters did not hold K'; end if;
  set local role authenticated;
  perform pg_temp.act(K);
  begin perform public.delete_my_account('DELETE'); raise exception 'FAIL: SEC-17 held person deleted himself';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

-- ADC-SEC-16 (3): pushes of the same kind to the same person for the same diwaniya are coalesced
do $$
declare v_u uuid := '00000000-0000-4000-8000-0000000000e2'; v_d uuid; v_a uuid; v_b uuid; v_c uuid;
begin
  select id into v_d from public.diwaniyas where name = 'Diwaniya R2 Test';
  insert into public.inbox (user_id, kind, diwaniya_id) values (v_u, 'request', v_d) returning id into v_a;
  insert into public.inbox (user_id, kind, diwaniya_id) values (v_u, 'request', v_d) returning id into v_b;
  insert into public.inbox (user_id, kind, diwaniya_id, body) values (v_u, 'announcement', v_d, 'x') returning id into v_c;
  if private.push_wanted(v_b, v_u, 'request', v_d) then raise exception 'FAIL: SEC-16 second push inside 2 minutes'; end if;
  if not private.push_wanted(v_c, v_u, 'announcement', v_d) then raise exception 'FAIL: announcement push coalesced'; end if;
end $$;

select 'r2_fixes_test: ALL GREEN' as result;
rollback;
