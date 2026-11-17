-- Sign-in slice tests (supabase/migrations/20261117192322_signin_men_only.sql).
-- Ali's rulings ADC-LOG-697: B 18+, C every diwaniya is men only and each user confirms
-- he is male at profile setup. One transaction that always rolls back.
-- Run: python3 scripts/sql_test.py supabase/tests/signin_test.sql
begin;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u::uuid, 'authenticated', 'authenticated',
       'dt-signin-' || right(u, 2) || '@example.test', now(), now()
from unnest(array[
  '00000000-0000-4000-8000-0000000000b1',  -- M confirms male, 18+
  '00000000-0000-4000-8000-0000000000b2',  -- X will not confirm
  '00000000-0000-4000-8000-0000000000b3'   -- E exactly 18 today
]) u;

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- 0. schema shape: no audience setting, old 4-argument profile RPC gone, anon locked out
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'diwaniyas' and column_name = 'audience') then
    raise exception 'FAIL: diwaniyas.audience still exists (ruling C)';
  end if;
  if to_regprocedure('public.complete_profile(text,text,date,boolean)') is not null then
    raise exception 'FAIL: 4-argument complete_profile still callable without the male confirmation';
  end if;
  if to_regprocedure('public.complete_profile(text,text,date,boolean,boolean)') is null then
    raise exception 'FAIL: 5-argument complete_profile missing';
  end if;
end $$;

set local role anon;
do $$
begin
  begin perform public.complete_profile('x', 'y', date '1990-01-01', true, true);
    raise exception 'FAIL: anon called complete_profile';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
do $$
declare
  M uuid := '00000000-0000-4000-8000-0000000000b1';
  X uuid := '00000000-0000-4000-8000-0000000000b2';
  E uuid := '00000000-0000-4000-8000-0000000000b3';
begin
  -- 1. no male confirmation, no profile (false and null both refused)
  perform pg_temp.act(X);
  begin perform public.complete_profile('Xavi', 'Salmiya', date '1990-01-01', true, false);
    raise exception 'FAIL: profile without male confirmation accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.complete_profile('Xavi', 'Salmiya', date '1990-01-01', true, null);
    raise exception 'FAIL: profile with null male confirmation accepted';
  exception when sqlstate '22023' then null; end;
  if exists (select 1 from public.profiles where id = X) then raise exception 'FAIL: refused profile left a row'; end if;
  -- ...and without a profile no seat can be asked for
  begin perform public.request_seat(gen_random_uuid(), null, 0, '', true);
    raise exception 'FAIL: seat request without a profile';
  exception when sqlstate '42501' then null; end;

  -- 2. B: one day short of 18 refused, exactly 18 today accepted
  perform pg_temp.act(E);
  begin perform public.complete_profile('Eid', 'Jahra', (current_date - interval '18 years' + interval '1 day')::date, true, true);
    raise exception 'FAIL: 17-year-old accepted';
  exception when sqlstate '22023' then null; end;
  perform public.complete_profile('Eid', 'Jahra', (current_date - interval '18 years')::date, true, true);

  -- 3. confirmation recorded with its time; the user can't edit it afterwards
  perform pg_temp.act(M);
  perform public.complete_profile('Mishal', 'Rawda', date '1988-03-03', true, true);
  if (select male_confirmed_at from public.profile_private where user_id = M) is null then
    raise exception 'FAIL: male confirmation not recorded';
  end if;
  begin update public.profile_private set male_confirmed_at = null where user_id = M;
    raise exception 'FAIL: male confirmation editable';
  exception when insufficient_privilege then null; end;

  -- 4. diwaniyas can't carry an audience any more
  begin
    execute format('insert into public.diwaniyas (host_id, name, area, audience) values (%L, %L, %L, %L)',
                   M, 'Mixed', 'Rawda', 'all');
    raise exception 'FAIL: audience accepted on insert';
  exception when undefined_column then null; end;
  insert into public.diwaniyas (host_id, name, area) values (M, 'Diwaniya Mishal', 'Rawda');
end $$;
reset role;

select 'signin_test green' as result;
rollback;
