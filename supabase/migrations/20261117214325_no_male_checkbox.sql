-- Diwaniya Tonight: no male-confirmation checkbox (Ali's order, ADC-LOG-751, 2026-11-18 00:36 Kuwait:
-- "Tell heimer to remove the check box for confirming the user is a man").
-- Ruling C (ADC-LOG-697) stays: every diwaniya is for men only, the Terms say so and there is no
-- audience setting. What goes is the per-user confirmation: profile setup no longer takes or checks
-- it, and profile_private.male_confirmed_at is no longer required. Confirmations already given are
-- kept as they are (nothing deleted); new profiles leave the column empty.

drop function public.complete_profile(text, text, date, boolean, boolean);

alter table public.profile_private alter column male_confirmed_at drop not null;

create function public.complete_profile(p_name text, p_area text, p_birth_date date, p_accept_terms boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
        v_area text := btrim(regexp_replace(coalesce(p_area, ''), '[[:cntrl:]]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
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
