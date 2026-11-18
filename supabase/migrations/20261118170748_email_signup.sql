-- Email + password sign-up next to Google (Ali's ruling ADC-LOG-802, 2026-11-18 20:05 Kuwait:
-- "Use supabase's one"). Supabase's built-in mailer (Ali approved it, ADC-LOG-621) sends the
-- confirmation and reset mails; the project keeps "confirm email" ON (mailer_autoconfirm false).
--
-- 1. The preview-era guard (ADC-LOG-776) that refused every email-provider user not on
--    private.test_accounts is removed, so the public can register with an email address.
--    private.test_accounts stays (scripts/create_test_accounts.py reads it; no API grants).
-- 2. Only confirmed addresses get in: GoTrue already refuses a password sign-in before the address
--    is confirmed; as a second lock, complete_profile (the gate to every signed-in RPC, which all
--    require a live profile) refuses an email-provider account whose address is not confirmed.
--    Google accounts and provider-less seed rows are not affected.

drop trigger if exists only_test_accounts_by_email on auth.users;
drop function if exists private.only_test_accounts_by_email();

create function private.email_confirmed(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select not (coalesce(u.raw_app_meta_data ->> 'provider', '') = 'email'
                or coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'email')
           or u.email_confirmed_at is not null
    from auth.users u where u.id = p_uid), false)
$$;
revoke all on function private.email_confirmed(uuid) from public, anon, authenticated;

create or replace function public.complete_profile(p_name text, p_area text, p_birth_date date, p_accept_terms boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
        v_area text := btrim(regexp_replace(coalesce(p_area, ''), '[[:cntrl:]]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not private.email_confirmed(auth.uid()) then
    raise exception 'confirm your email first' using errcode = '42501';
  end if;
  if private.is_banned(auth.uid()) then raise exception 'your account is under review' using errcode = '42501'; end if;
  if v_name = '' or v_area = '' then raise exception 'name and area are required' using errcode = '22023'; end if;
  if p_accept_terms is not true then raise exception 'accept the terms first' using errcode = '22023'; end if;
  if p_birth_date is null or p_birth_date > (current_date - make_interval(years => private.min_age()))::date
     or p_birth_date < date '1900-01-01' then
    raise exception 'too young for Diwaniya Tonight' using errcode = '22023';
  end if;
  insert into public.profile_private (user_id, birth_date, terms_accepted_at)
    values (auth.uid(), p_birth_date, now())
    on conflict (user_id) do nothing;  -- birth date and the Terms consent are set once
  insert into public.profiles (id, display_name, area) values (auth.uid(), left(v_name, 40), left(v_area, 60))
    on conflict (id) do update set display_name = excluded.display_name, area = excluded.area;
end $$;

revoke all on function public.complete_profile(text, text, date, boolean) from public, anon;
grant execute on function public.complete_profile(text, text, date, boolean) to authenticated;
