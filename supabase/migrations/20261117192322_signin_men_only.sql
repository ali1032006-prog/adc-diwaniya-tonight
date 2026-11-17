-- Diwaniya Tonight, sign-in slice (ADC-TSK-36).
-- Ali's rulings, ADC-LOG-696/697:
--   A  sign-in is Google only (the email provider is closed in the auth config, not here);
--   B  minimum age 18 (private.min_age() already returns 18; complete_profile enforces it);
--   C  "DIWANIYAS ARE ONLY FOR MEN": every diwaniya is men only, so the audience
--      setting goes, and each user confirms he is male when he sets up his profile.

-- C: no audience setting any more. Its column privileges go with the column.
alter table public.diwaniyas drop column audience;

-- C: the male self-declaration, recorded once with the time it was given.
-- profile_private is empty on dev (checked before applying); a live database starts empty too.
alter table public.profile_private add column male_confirmed_at timestamptz not null;

-- S3 profile setup now also takes the male confirmation. The old 4-argument
-- version is dropped so nothing can create a profile without it.
drop function public.complete_profile(text, text, date, boolean);

create function public.complete_profile(p_name text, p_area text, p_birth_date date,
                                        p_accept_terms boolean, p_confirm_male boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
        v_area text := btrim(regexp_replace(coalesce(p_area, ''), '[[:cntrl:]]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if v_name = '' or v_area = '' then raise exception 'name and area are required' using errcode = '22023'; end if;
  if p_accept_terms is not true then raise exception 'accept the terms first' using errcode = '22023'; end if;
  if p_confirm_male is not true then raise exception 'diwaniyas here are for men only' using errcode = '22023'; end if;
  if p_birth_date is null or p_birth_date > (current_date - make_interval(years => private.min_age()))::date
     or p_birth_date < date '1900-01-01' then
    raise exception 'too young for Diwaniya Tonight' using errcode = '22023';
  end if;
  insert into public.profile_private (user_id, birth_date, terms_accepted_at, male_confirmed_at)
    values (auth.uid(), p_birth_date, now(), now())
    on conflict (user_id) do nothing;  -- birth date and both consents are set once
  insert into public.profiles (id, display_name, area) values (auth.uid(), left(v_name, 40), left(v_area, 60))
    on conflict (id) do update set display_name = excluded.display_name, area = excluded.area;
end $$;

revoke all on function public.complete_profile(text, text, date, boolean, boolean) from public, anon;
grant execute on function public.complete_profile(text, text, date, boolean, boolean) to authenticated;
