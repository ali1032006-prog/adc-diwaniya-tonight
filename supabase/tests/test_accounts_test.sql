-- Test accounts for the review team (Ali's ruling on Agent Issue 52, ADC-LOG-775).
-- The four review accounts (Jayce and Vi, user + admin) are listed in private.test_accounts, which
-- scripts/create_test_accounts.py reads. Since Ali's ruling ADC-LOG-802 ("Use supabase's one") public
-- email sign-up is open, so the list no longer gates sign-up (supabase/tests/email_signup_test.sql
-- covers that); it must stay unreadable through the API roles.
-- One transaction that always rolls back.
-- Run: python3 scripts/sql_test.py supabase/tests/test_accounts_test.sql
begin;

do $$
begin
  if to_regclass('private.test_accounts') is null then
    raise exception 'FAIL: private.test_accounts list missing';
  end if;
  if (select count(*) from private.test_accounts) <> 4 then
    raise exception 'FAIL: expected exactly 4 listed test accounts, got %', (select count(*) from private.test_accounts);
  end if;
  if exists (select 1 from private.test_accounts where email !~ '\.test@example\.com$') then
    raise exception 'FAIL: a test account address is not clearly a test address';
  end if;
  if has_table_privilege('anon', 'private.test_accounts', 'select')
     or has_table_privilege('authenticated', 'private.test_accounts', 'select') then
    raise exception 'FAIL: the list is readable through the API roles';
  end if;
end $$;

select 'test_accounts_test OK';
rollback;
