-- Test-account guard (Ali's ruling on Agent Issue 52, ADC-LOG-775).
-- The dev project turns the email provider on so the four review test accounts can sign in with a
-- password on preview builds. Public email sign-up must stay closed: an email/password user can only
-- exist if its address is on private.test_accounts. Google sign-ups are untouched.
-- One transaction that always rolls back.
-- Run: python3 scripts/sql_test.py supabase/tests/test_accounts_test.sql
begin;

do $$
begin
  if to_regclass('private.test_accounts') is null then
    raise exception 'FAIL: private.test_accounts allow-list missing';
  end if;
  if (select count(*) from private.test_accounts) <> 4 then
    raise exception 'FAIL: expected exactly 4 allow-listed test accounts, got %', (select count(*) from private.test_accounts);
  end if;
  if exists (select 1 from private.test_accounts where email !~ '\.test@example\.com$') then
    raise exception 'FAIL: a test account address is not clearly a test address';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'only_test_accounts_by_email'
                 and tgrelid = 'auth.users'::regclass and not tgisinternal) then
    raise exception 'FAIL: guard trigger on auth.users missing';
  end if;
  if has_table_privilege('anon', 'private.test_accounts', 'select')
     or has_table_privilege('authenticated', 'private.test_accounts', 'select') then
    raise exception 'FAIL: the allow-list is readable through the API roles';
  end if;
end $$;

-- 1. a stranger's email sign-up is refused
do $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052001', 'authenticated',
          'authenticated', 'stranger@example.org', '{"provider":"email","providers":["email"]}', now(), now());
  raise exception 'FAIL: email sign-up for a stranger was allowed';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

-- 1b. the same with upper-case letters and spaces around an allow-listed address is not a bypass
do $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052002', 'authenticated',
          'authenticated', 'x' || (select email from private.test_accounts limit 1), '{"provider":"email"}', now(), now());
  raise exception 'FAIL: a look-alike of a test address was allowed';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

-- 2. an allow-listed test address is accepted (in any letter case)
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052003', 'authenticated',
       'authenticated', upper(email), '{"provider":"email","providers":["email"]}', now(), now()
from private.test_accounts where label = 'vi-user';

-- 3. Google sign-ups and rows without a provider (seeds, other tests) are untouched
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052004', 'authenticated',
        'authenticated', 'someone@gmail.test', '{"provider":"google","providers":["google"]}', now(), now()),
       ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052005', 'authenticated',
        'authenticated', 'seed@example.test', '{}', now(), now());

-- 4. a Google user cannot later switch the row to the email provider for a stranger's address
do $$
begin
  update auth.users set raw_app_meta_data = '{"provider":"email","providers":["email"]}'
  where id = '00000000-0000-4000-8000-000000052004';
  raise exception 'FAIL: switching a stranger to the email provider was allowed';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

-- 5. scripts/live_smoke.py: its throwaway smoke-*@example.invalid accounts pass only with the run's
--    session switch on (set by that script's own SQL, which the API roles cannot reach) ...
select set_config('adc.smoke_insert', 'on', true);
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052006', 'authenticated',
        'authenticated', 'smoke-host-abcd1234@example.invalid', '{"provider":"email"}', now(), now());
-- ... and the switch is no bypass for any other address
do $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052007', 'authenticated',
          'authenticated', 'stranger2@example.org', '{"provider":"email"}', now(), now());
  raise exception 'FAIL: the smoke switch let a stranger in';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
select set_config('adc.smoke_insert', '', true);
-- ... and without the switch a smoke-looking address is refused like any other
do $$
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000052008', 'authenticated',
          'authenticated', 'smoke-host-ffff0000@example.invalid', '{"provider":"email"}', now(), now());
  raise exception 'FAIL: a smoke-looking address got in without the run switch';
exception when sqlstate 'P0001' then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;

select 'test_accounts_test OK';
rollback;
