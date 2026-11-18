-- Test-account guard, part 2 (ADC-LOG-775). scripts/live_smoke.py makes two throwaway
-- smoke-*@example.invalid email accounts in its own SQL for each run and deletes them after.
-- They pass the guard only while that SQL has set the transaction-local switch adc.smoke_insert = on,
-- which only direct database SQL (Management API, the owner) can set; Auth and the Data API cannot.

create or replace function private.only_test_accounts_by_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email'
     or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'email' then
    if exists (select 1 from private.test_accounts t where t.email = lower(new.email)) then
      return new;
    end if;
    if coalesce(current_setting('adc.smoke_insert', true), '') = 'on'
       and lower(new.email) ~ '^smoke-(host|guest)-[0-9a-f]{8}@example\.invalid$' then
      return new;
    end if;
    raise exception 'email sign-up is closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.only_test_accounts_by_email() from public, anon, authenticated;
