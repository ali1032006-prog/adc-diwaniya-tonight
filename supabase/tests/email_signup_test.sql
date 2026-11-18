-- Email + password sign-up (Ali's ruling ADC-LOG-802, 2026-11-18 20:05 Kuwait: "Use supabase's one").
-- Public email sign-up is open next to Google; Supabase's built-in mailer sends the confirmation and
-- the project keeps "confirm email" ON. Only confirmed addresses get in: an email-provider account
-- that has not confirmed cannot complete its profile (the gate to every signed-in RPC), even if
-- the project's auto-confirm were ever switched on by mistake for an old row.
-- One transaction that always rolls back.
-- Run: python3 scripts/sql_test.py supabase/tests/email_signup_test.sql
begin;

-- 0. the preview-era guard that refused public email sign-ups is gone; the allow-list stays private
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'only_test_accounts_by_email'
             and tgrelid = 'auth.users'::regclass and not tgisinternal) then
    raise exception 'FAIL: the test-account guard still refuses public email sign-ups';
  end if;
  if to_regprocedure('private.email_confirmed(uuid)') is null then
    raise exception 'FAIL: private.email_confirmed(uuid) missing';
  end if;
  if has_function_privilege('anon', 'private.email_confirmed(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.email_confirmed(uuid)', 'execute') then
    raise exception 'FAIL: private.email_confirmed is callable through the API roles';
  end if;
end $$;

-- 1. a stranger's email sign-up row can now exist (GoTrue writes it unconfirmed)
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000080201', 'authenticated',
   'authenticated', 'new.person@example.org', '{"provider":"email","providers":["email"]}', null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000080202', 'authenticated',
   'authenticated', 'confirmed.person@example.org', '{"provider":"email","providers":["email"]}', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000080203', 'authenticated',
   'authenticated', 'google.person@gmail.test', '{"provider":"google","providers":["google"]}', null, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000080204', 'authenticated',
   'authenticated', 'linked.person@example.org', '{"provider":"google","providers":["google","email"]}', null, now(), now());

create function pg_temp.act(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

do $$
begin
  if private.email_confirmed('00000000-0000-4000-8000-000000080201') then
    raise exception 'FAIL: an unconfirmed email account counts as confirmed';
  end if;
  if not private.email_confirmed('00000000-0000-4000-8000-000000080202') then
    raise exception 'FAIL: a confirmed email account counts as unconfirmed';
  end if;
  if not private.email_confirmed('00000000-0000-4000-8000-000000080203') then
    raise exception 'FAIL: a Google account is held back by the email check';
  end if;
  if private.email_confirmed('00000000-0000-4000-8000-000000080204') then
    raise exception 'FAIL: an unconfirmed email identity linked to a Google row slips through';
  end if;
  if private.email_confirmed('00000000-0000-4000-8000-0000000802ff') then
    raise exception 'FAIL: an unknown user id counts as confirmed';
  end if;
end $$;

set local role authenticated;

-- 2. unconfirmed email account: profile setup refused with 42501 and nothing written
do $$
begin
  perform pg_temp.act('00000000-0000-4000-8000-000000080201');
  perform public.complete_profile('New Person', 'Hawalli', date '1990-01-01', true);
  raise exception 'FAIL: an unconfirmed email account completed its profile';
exception when sqlstate '42501' then
  if sqlerrm not like '%confirm your email%' then raise exception 'FAIL: wrong refusal: %', sqlerrm; end if;
end $$;

-- 3. confirmed email account and Google account: profile setup works as before (18+, Terms)
do $$
begin
  perform pg_temp.act('00000000-0000-4000-8000-000000080202');
  perform public.complete_profile('Confirmed Person', 'Hawalli', date '1990-01-01', true);
  perform pg_temp.act('00000000-0000-4000-8000-000000080203');
  perform public.complete_profile('Google Person', 'Salmiya', date '1991-02-02', true);
end $$;

reset role;
do $$
begin
  if (select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000080202',
                                                         '00000000-0000-4000-8000-000000080203')) <> 2 then
    raise exception 'FAIL: confirmed accounts have no profile';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000080201')
     or exists (select 1 from public.profile_private where user_id = '00000000-0000-4000-8000-000000080201') then
    raise exception 'FAIL: the unconfirmed account got a profile row';
  end if;
end $$;

-- 5. a brand-new confirmed email account under 18 or without Terms is refused like Google ones
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000080205', 'authenticated',
        'authenticated', 'young.person@example.org', '{"provider":"email","providers":["email"]}', now(), now(), now());
set local role authenticated;
do $$
begin
  perform pg_temp.act('00000000-0000-4000-8000-000000080205');
  begin
    perform public.complete_profile('Young', 'Hawalli', (current_date - interval '17 years')::date, true);
    raise exception 'FAIL: a 17-year-old email account completed its profile';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.complete_profile('Young', 'Hawalli', date '1990-01-01', false);
    raise exception 'FAIL: an email account without Terms completed its profile';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;

select 'email_signup_test OK';
rollback;
