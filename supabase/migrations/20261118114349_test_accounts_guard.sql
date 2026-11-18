-- Test accounts for the review team (Ali's ruling on Agent Issue 52, ADC-LOG-775, 2026-11-18:
-- "Jayce and vi test accounts"). DEV PROJECT ONLY (diwaniya-tonight-dev). Never apply to a live project.
--
-- Four accounts (Jayce user, Jayce admin, Vi user, Vi admin) are made with the Supabase admin API,
-- with passwords Ali places on the server himself. They sign in with a password form that exists only
-- in preview builds. For that the dev project's email provider is switched on, so this guard keeps
-- public email sign-up closed: an email/password user may only exist for an address on this list.
-- Google sign-up is untouched. The list lives in the private schema (not exposed by the API).

create table private.test_accounts (
  email text primary key check (email = lower(email) and email ~ '\.test@example\.com$'),
  label text not null unique check (label in ('jayce-user', 'jayce-admin', 'vi-user', 'vi-admin')),
  admin boolean not null,
  added_at timestamptz not null default now()
);
alter table private.test_accounts enable row level security;
revoke all on private.test_accounts from public, anon, authenticated;

insert into private.test_accounts (email, label, admin) values
  ('jayce.user.test@example.com', 'jayce-user', false),
  ('jayce.admin.test@example.com', 'jayce-admin', true),
  ('vi.user.test@example.com', 'vi-user', false),
  ('vi.admin.test@example.com', 'vi-admin', true);

create function private.only_test_accounts_by_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email'
     or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'email' then
    if not exists (select 1 from private.test_accounts t where t.email = lower(new.email)) then
      raise exception 'email sign-up is closed' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.only_test_accounts_by_email() from public, anon, authenticated;

create trigger only_test_accounts_by_email
  before insert or update of raw_app_meta_data, email on auth.users
  for each row execute function private.only_test_accounts_by_email();
