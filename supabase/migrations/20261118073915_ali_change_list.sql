-- Ali's change list for Diwaniya Tonight (ADC-LOG-754, ADC-TSK-36, before review round 2/3).
-- (1) areas are picked from Kuwait's governorates and areas, checked on every write;
-- (3) every scored game reaches the league: walk-in names count by name (the root cause of
--     "scoring doesn't add it to league": games typed by name had no user_id and the season
--     view kept only rows with one), and one person can't sit twice in a game;
-- (4) a guest checked in at a diwaniya tonight may score that night's tables and nothing else;
-- (5) the pin sits inside Kuwait; (6) my_diwaniyas() for the My diwaniyas page.
-- Tests: supabase/tests/ali_changes_test.sql (written first, red on 80a680f).

-- ---------------------------------------------------------------- (1) Kuwait areas
create table public.kuwait_areas (
  name_ar text primary key,
  name_en text not null,
  governorate text not null check (governorate in ('capital','hawalli','farwaniya','mubarak','ahmadi','jahra')),
  sort int not null unique
);
alter table public.kuwait_areas enable row level security;
create policy kuwait_areas_read on public.kuwait_areas for select to anon, authenticated using (true);
revoke all on public.kuwait_areas from anon, authenticated;
grant select on public.kuwait_areas to anon, authenticated;

insert into public.kuwait_areas (name_ar, name_en, governorate, sort) values
  ('مدينة الكويت', 'Kuwait City', 'capital', 1),
  ('شرق', 'Sharq', 'capital', 2),
  ('المرقاب', 'Mirqab', 'capital', 3),
  ('القبلة', 'Qibla', 'capital', 4),
  ('دسمان', 'Dasman', 'capital', 5),
  ('بنيد القار', 'Bneid Al-Gar', 'capital', 6),
  ('الدسمة', 'Dasma', 'capital', 7),
  ('الدعية', 'Daiya', 'capital', 8),
  ('الشامية', 'Shamiya', 'capital', 9),
  ('الشويخ', 'Shuwaikh', 'capital', 10),
  ('ضاحية عبدالله السالم', 'Abdullah Al-Salem', 'capital', 11),
  ('المنصورية', 'Mansouriya', 'capital', 12),
  ('النزهة', 'Nuzha', 'capital', 13),
  ('الفيحاء', 'Faiha', 'capital', 14),
  ('كيفان', 'Kaifan', 'capital', 15),
  ('العديلية', 'Adailiya', 'capital', 16),
  ('الخالدية', 'Khaldiya', 'capital', 17),
  ('القادسية', 'Qadsiya', 'capital', 18),
  ('الروضة', 'Rawda', 'capital', 19),
  ('السرة', 'Surra', 'capital', 20),
  ('اليرموك', 'Yarmouk', 'capital', 21),
  ('قرطبة', 'Qurtuba', 'capital', 22),
  ('غرناطة', 'Granada', 'capital', 23),
  ('الصليبيخات', 'Sulaibikhat', 'capital', 24),
  ('الدوحة', 'Doha', 'capital', 25),
  ('النهضة', 'Nahda', 'capital', 26),
  ('القيروان', 'Qairawan', 'capital', 27),
  ('حولي', 'Hawalli', 'hawalli', 28),
  ('السالمية', 'Salmiya', 'hawalli', 29),
  ('الرميثية', 'Rumaithiya', 'hawalli', 30),
  ('الجابرية', 'Jabriya', 'hawalli', 31),
  ('مشرف', 'Mishref', 'hawalli', 32),
  ('بيان', 'Bayan', 'hawalli', 33),
  ('سلوى', 'Salwa', 'hawalli', 34),
  ('الشعب', 'Shaab', 'hawalli', 35),
  ('الشهداء', 'Shuhada', 'hawalli', 36),
  ('حطين', 'Hittin', 'hawalli', 37),
  ('السلام', 'Salam', 'hawalli', 38),
  ('الصديق', 'Siddiq', 'hawalli', 39),
  ('الزهراء', 'Zahra', 'hawalli', 40),
  ('مبارك العبدالله', 'Mubarak Al-Abdullah', 'hawalli', 41),
  ('ميدان حولي', 'Maidan Hawalli', 'hawalli', 42),
  ('البدع', 'Bidaa', 'hawalli', 43),
  ('الفروانية', 'Farwaniya', 'farwaniya', 44),
  ('خيطان', 'Khaitan', 'farwaniya', 45),
  ('جليب الشيوخ', 'Jleeb Al-Shuyoukh', 'farwaniya', 46),
  ('العارضية', 'Ardiya', 'farwaniya', 47),
  ('الأندلس', 'Andalus', 'farwaniya', 48),
  ('الرابية', 'Rabiya', 'farwaniya', 49),
  ('الرحاب', 'Rehab', 'farwaniya', 50),
  ('العمرية', 'Omariya', 'farwaniya', 51),
  ('الري', 'Rai', 'farwaniya', 52),
  ('إشبيلية', 'Ishbiliya', 'farwaniya', 53),
  ('الفردوس', 'Firdous', 'farwaniya', 54),
  ('عبدالله المبارك', 'Abdullah Al-Mubarak', 'farwaniya', 55),
  ('أبرق خيطان', 'Abraq Khaitan', 'farwaniya', 56),
  ('صباح الناصر', 'Sabah Al-Nasser', 'farwaniya', 57),
  ('الضجيج', 'Dhajeej', 'farwaniya', 58),
  ('مبارك الكبير', 'Mubarak Al-Kabeer', 'mubarak', 59),
  ('القرين', 'Qurain', 'mubarak', 60),
  ('القصور', 'Qusour', 'mubarak', 61),
  ('العدان', 'Adan', 'mubarak', 62),
  ('صباح السالم', 'Sabah Al-Salem', 'mubarak', 63),
  ('المسيلة', 'Messila', 'mubarak', 64),
  ('أبو فطيرة', 'Abu Fteira', 'mubarak', 65),
  ('الفنيطيس', 'Funaitees', 'mubarak', 66),
  ('أبو الحصانية', 'Abu Al-Hasaniya', 'mubarak', 67),
  ('المسايل', 'Masayel', 'mubarak', 68),
  ('الأحمدي', 'Ahmadi', 'ahmadi', 69),
  ('الفحيحيل', 'Fahaheel', 'ahmadi', 70),
  ('الفنطاس', 'Fintas', 'ahmadi', 71),
  ('المنقف', 'Mangaf', 'ahmadi', 72),
  ('أبو حليفة', 'Abu Halifa', 'ahmadi', 73),
  ('المهبولة', 'Mahboula', 'ahmadi', 74),
  ('العقيلة', 'Egaila', 'ahmadi', 75),
  ('الرقة', 'Riqqa', 'ahmadi', 76),
  ('هدية', 'Hadiya', 'ahmadi', 77),
  ('الصباحية', 'Sabahiya', 'ahmadi', 78),
  ('فهد الأحمد', 'Fahad Al-Ahmad', 'ahmadi', 79),
  ('جابر العلي', 'Jaber Al-Ali', 'ahmadi', 80),
  ('الظهر', 'Dhaher', 'ahmadi', 81),
  ('الوفرة', 'Wafra', 'ahmadi', 82),
  ('الخيران', 'Khairan', 'ahmadi', 83),
  ('الزور', 'Zour', 'ahmadi', 84),
  ('صباح الأحمد', 'Sabah Al-Ahmad', 'ahmadi', 85),
  ('علي صباح السالم', 'Ali Sabah Al-Salem', 'ahmadi', 86),
  ('الجليعة', 'Julaia', 'ahmadi', 87),
  ('بنيدر', 'Bnaider', 'ahmadi', 88),
  ('الجهراء', 'Jahra', 'jahra', 89),
  ('القصر', 'Qasr', 'jahra', 90),
  ('النعيم', 'Naeem', 'jahra', 91),
  ('العيون', 'Oyoun', 'jahra', 92),
  ('الواحة', 'Waha', 'jahra', 93),
  ('تيماء', 'Taima', 'jahra', 94),
  ('النسيم', 'Naseem', 'jahra', 95),
  ('سعد العبدالله', 'Saad Al-Abdullah', 'jahra', 96),
  ('مدينة جابر الأحمد', 'Jaber Al-Ahmad City', 'jahra', 97),
  ('الصليبية', 'Sulaibiya', 'jahra', 98),
  ('أمغرة', 'Amghara', 'jahra', 99),
  ('كبد', 'Kabd', 'jahra', 100),
  ('العبدلي', 'Abdali', 'jahra', 101),
  ('المطلاع', 'Mutlaa', 'jahra', 102),
  ('الصبية', 'Subiya', 'jahra', 103);

-- Older free-text values: English names become the Arabic list name; the one governorate-only
-- value seen on dev ('Asimah') becomes Kuwait City. Anything else stays until its owner picks again.
update public.profiles p set area = k.name_ar from public.kuwait_areas k where lower(btrim(p.area)) = lower(k.name_en);
update public.profiles set area = 'مدينة الكويت' where lower(btrim(area)) in ('asimah', 'capital', 'al asimah', 'العاصمة');
update public.diwaniyas d set area = k.name_ar from public.kuwait_areas k where lower(btrim(d.area)) = lower(k.name_en);
update public.profile_private pp set ping_areas = coalesce((
  select array_agg(distinct k.name_ar) from unnest(pp.ping_areas) x
  join public.kuwait_areas k on k.name_ar = btrim(x) or lower(k.name_en) = lower(btrim(x))), '{}');

create function private.area_ok(a text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kuwait_areas k where k.name_ar = a)
$$;

-- The list's Arabic name for a; its English name is accepted and mapped (any case).
create function private.area_name(a text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select k.name_ar from public.kuwait_areas k
                   where k.name_ar = btrim(a) or lower(k.name_en) = lower(btrim(a)) limit 1), btrim(a))
$$;

-- A new or changed area must be on the list (rows written before this migration are left alone).
create function private.check_area() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.area := private.area_name(new.area);
  if (tg_op = 'INSERT' or new.area is distinct from old.area) and not private.area_ok(new.area) then
    raise exception 'pick an area from the list' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_check_area before insert or update of area on public.profiles
  for each row execute function private.check_area();
create trigger diwaniyas_check_area before insert or update of area on public.diwaniyas
  for each row execute function private.check_area();

create function private.check_ping_areas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.ping_areas := coalesce((select array_agg(distinct private.area_name(x)) from unnest(new.ping_areas) x), '{}');
  if exists (select 1 from unnest(new.ping_areas) x where not private.area_ok(x)) then
    raise exception 'pick ping areas from the list' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profile_private_check_ping_areas before insert or update of ping_areas on public.profile_private
  for each row execute function private.check_ping_areas();

revoke all on function private.check_area(), private.check_ping_areas() from public, anon, authenticated;

-- ---------------------------------------------------------------- (5) the pin is in Kuwait
alter table public.diwaniya_pins add constraint diwaniya_pins_in_kuwait
  check (lat between 28.45 and 30.15 and lng between 46.50 and 48.60);

-- ---------------------------------------------------------------- (4) who may score
-- Checked in tonight: the night is open and he holds a seat at one of its tables, or the host
-- marked him arrived. t must be one of that night's tables.
create function private.checked_in_at(d uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.game_tables gt join public.nights n on n.id = gt.night_id
    where gt.id = t and n.diwaniya_id = d and n.status = 'open'
      and (exists (select 1 from public.seats s join public.game_tables g2 on g2.id = s.table_id
                   where g2.night_id = n.id and s.user_id = auth.uid())
           or exists (select 1 from public.requests q
                      where q.night_id = n.id and q.user_id = auth.uid() and q.status = 'arrived')))
$$;

-- Managers and regulars score any time; a guest only while checked in, only that night's tables.
-- Never a hidden or held account, never someone blocked with the host or one of its managers.
create function private.can_score(d uuid, t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and private.profile_live(auth.uid())
     and (private.can_manage(d)
          or (not exists (select 1 from public.diwaniyas x where x.id = d and private.blocked_between(x.host_id, auth.uid()))
              and not exists (select 1 from public.cohosts c where c.diwaniya_id = d and c.accepted_at is not null
                                and private.blocked_between(c.user_id, auth.uid()))
              and exists (select 1 from public.diwaniyas x where x.id = d and x.hidden_at is null and x.held_at is null)
              and (exists (select 1 from public.regulars r where r.diwaniya_id = d and r.user_id = auth.uid())
                   or (t is not null and private.checked_in_at(d, t)))))
$$;

create or replace function public.record_game(p_diwaniya uuid, p_rule_pack text, p_table uuid, p_results jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_n int; v_host uuid;
begin
  if not private.can_score(p_diwaniya, p_table) then
    raise exception 'only its managers, regulars and guests checked in tonight can score here' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'results must be a list' using errcode = '22023'; end if;
  v_n := jsonb_array_length(p_results);
  if v_n < 2 or v_n > 6 then raise exception 'a game has 2 to 6 players' using errcode = '22023'; end if;
  if p_table is not null and private.table_diwaniya(p_table) is distinct from p_diwaniya then
    raise exception 'table not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_array_elements(p_results) e
             where nullif(e->>'user_id', '') is not null
               and not exists (select 1 from public.profiles p where p.id = (e->>'user_id')::uuid)) then
    raise exception 'unknown player' using errcode = '22023';
  end if;
  -- One person, one seat: no account twice, no walk-in name twice (any case or spacing).
  if (select count(*) <> count(distinct coalesce(nullif(e->>'user_id', ''), 'guest:' || lower(btrim(coalesce(e->>'name', '')))))
      from jsonb_array_elements(p_results) e) then
    raise exception 'a player is in this game twice' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_results) e
             where nullif(e->>'user_id', '') is null and btrim(coalesce(e->>'name', '')) = '') then
    raise exception 'every seat needs a name' using errcode = '22023';
  end if;
  select host_id into v_host from public.diwaniyas where id = p_diwaniya;
  -- Every named player was really there: seated at this table, approved for a night here, a
  -- regular, or one of its managers. Never someone blocked either way, hidden or held.
  if exists (
    select 1 from jsonb_array_elements(p_results) e
    cross join lateral (select (nullif(e->>'user_id', ''))::uuid as u) x
    where x.u is not null and x.u <> auth.uid()
      and (not private.profile_live(x.u)
           or private.blocked_between(auth.uid(), x.u)
           or private.blocked_between(v_host, x.u)
           or not (
             (p_table is not null and exists (select 1 from public.seats s where s.table_id = p_table and s.user_id = x.u))
             or exists (select 1 from public.requests q join public.nights n on n.id = q.night_id
                        where n.diwaniya_id = p_diwaniya and q.user_id = x.u and q.status in ('approved','arrived'))
             or exists (select 1 from public.regulars r where r.diwaniya_id = p_diwaniya and r.user_id = x.u)
             or private.manages(x.u, p_diwaniya)))) then
    raise exception 'a player was not at this diwaniya' using errcode = '22023';
  end if;
  insert into public.played_games (diwaniya_id, table_id, rule_pack, recorded_by)
    values (p_diwaniya, p_table, p_rule_pack, auth.uid()) returning id into v_id;
  insert into public.game_results (game_id, seat, user_id, name, team, points, won)
  select v_id, (e->>'seat')::smallint,
         case when p.id is not null then p.id end,
         left(btrim(regexp_replace(coalesce(p.display_name, e->>'name', ''), '[[:cntrl:]]', '', 'g')), 40),
         (e->>'team')::smallint, (e->>'points')::int, (e->>'won')::boolean
  from jsonb_array_elements(p_results) e
  left join public.profiles p on p.id = nullif(e->>'user_id', '')::uuid;
  return v_id;
end $$;

-- Undo: managers any time; whoever scored it only while he may still score there.
create or replace function public.undo_game(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_g public.played_games;
begin
  select * into v_g from public.played_games where id = p_game for update;
  if v_g.id is null or not (private.can_manage(v_g.diwaniya_id)
                            or (v_g.recorded_by = auth.uid() and private.can_score(v_g.diwaniya_id, v_g.table_id))) then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  update public.played_games set undone_at = now() where id = p_game and undone_at is null;
end $$;

-- The people a scorer may name, so the score sheet links accounts instead of typed names:
-- himself, everyone seated at the table (with the seat), tonight's approved guests, regulars
-- and managers. Never a hidden person or anyone blocked with the scorer or the host.
create function public.score_roster(p_diwaniya uuid, p_table uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_host uuid; v_night uuid;
begin
  if not private.can_score(p_diwaniya, p_table) then
    raise exception 'only its managers, regulars and guests checked in tonight can score here' using errcode = '42501';
  end if;
  if p_table is not null and private.table_diwaniya(p_table) is distinct from p_diwaniya then
    raise exception 'table not found' using errcode = 'P0002';
  end if;
  select host_id into v_host from public.diwaniyas where id = p_diwaniya;
  select id into v_night from public.nights where diwaniya_id = p_diwaniya and status = 'open' order by starts_at desc limit 1;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'seat', w.seat)
                     order by w.seat nulls last, p.display_name)
    from (
      select c.u, min(c.seat) as seat from (
        select auth.uid() as u, null::int as seat
        union all select s.user_id, s.seat_no from public.seats s where p_table is not null and s.table_id = p_table and s.user_id is not null
        union all select q.user_id, null from public.requests q where v_night is not null and q.night_id = v_night and q.status in ('approved','arrived')
        union all select r.user_id, null from public.regulars r where r.diwaniya_id = p_diwaniya
        union all select v_host, null
        union all select c2.user_id, null from public.cohosts c2 where c2.diwaniya_id = p_diwaniya and c2.accepted_at is not null
      ) c group by c.u
    ) w
    join public.profiles p on p.id = w.u
    where private.profile_live(p.id)
      and (p.id = auth.uid() or not (private.blocked_between(auth.uid(), p.id) or private.blocked_between(v_host, p.id)))
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- (3) the season table
-- Walk-ins (no account) count by name inside each diwaniya; accounts by their id. player_key
-- tells the two apart for the screen ('guest:<lower name>' or the user id).
create or replace view public.league_standings with (security_invoker = true) as
  select g.diwaniya_id, r.user_id, max(r.name) as name,
         count(*) as played, count(*) filter (where r.won) as wins,
         min(g.played_at) as first_played, max(g.played_at) as last_played,
         coalesce(r.user_id::text, 'guest:' || lower(btrim(r.name))) as player_key
  from public.game_results r join public.played_games g on g.id = r.game_id
  where g.undone_at is null
  group by g.diwaniya_id, r.user_id, coalesce(r.user_id::text, 'guest:' || lower(btrim(r.name)));
revoke all on public.league_standings from anon, authenticated;
grant select on public.league_standings to authenticated;

-- The League screen reloads when a game lands (Realtime honours RLS: games_read).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'played_games') then
    alter publication supabase_realtime add table public.played_games;
  end if;
end $$;

-- ---------------------------------------------------------------- (6) My diwaniyas
-- The caller's diwaniyas with tonight's state, read with his own rights (RLS applies):
-- followed, regular, visited (arrived on 2+ nights in 90 days) or requested tonight.
create function public.my_diwaniyas()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with why as (
    select f.diwaniya_id as d, 'follow'::text as w from public.follows f where f.user_id = auth.uid()
    union all
    select r.diwaniya_id, 'regular' from public.regulars r where r.user_id = auth.uid()
    union all
    select v.d, 'visit' from (
      select n.diwaniya_id as d from public.requests q join public.nights n on n.id = q.night_id
      where q.user_id = auth.uid() and q.status = 'arrived' and n.starts_at > now() - interval '90 days'
      group by n.diwaniya_id having count(distinct n.id) >= 2) v
    union all
    select n.diwaniya_id, 'tonight' from public.requests q join public.nights n on n.id = q.night_id
    where q.user_id = auth.uid() and n.status = 'open' and q.status in ('pending','approved','arrived')
  ), agg as (
    select d, jsonb_agg(distinct w) as why from why group by d
  )
  select coalesce(jsonb_agg(x order by (x->>'night_id') is null, x->>'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', dw.id, 'name', dw.name, 'area', dw.area, 'visibility', dw.visibility, 'why', a.why,
      'night_id', n.id, 'starts_at', n.starts_at,
      'open_seats', (select coalesce(sum(gt.seat_count), 0) - (select count(*) from public.seats s join public.game_tables g2 on g2.id = s.table_id where g2.night_id = n.id)
                     from public.game_tables gt where gt.night_id = n.id),
      'need_one', (select coalesce(bool_or(gt.need_one), false) from public.game_tables gt where gt.night_id = n.id),
      'my_status', (select q.status from public.requests q where q.night_id = n.id and q.user_id = auth.uid()
                    order by q.created_at desc limit 1),
      'my_request', (select q.id from public.requests q where q.night_id = n.id and q.user_id = auth.uid()
                     order by q.created_at desc limit 1),
      'my_table', (select q.table_id from public.requests q where q.night_id = n.id and q.user_id = auth.uid()
                   order by q.created_at desc limit 1),
      'seated_table', (select s.table_id from public.seats s join public.game_tables g2 on g2.id = s.table_id
                       where g2.night_id = n.id and s.user_id = auth.uid() limit 1)
    ) as x
    from agg a
    join public.diwaniyas dw on dw.id = a.d
    left join lateral (select n.id, n.starts_at from public.nights n
                       where n.diwaniya_id = dw.id and n.status = 'open' order by n.starts_at desc limit 1) n on true
  ) rows
$$;

revoke all on function public.score_roster(uuid, uuid), public.my_diwaniyas() from public, anon;
grant execute on function public.score_roster(uuid, uuid), public.my_diwaniyas() to authenticated;
revoke all on function private.area_ok(text), private.area_name(text), private.checked_in_at(uuid, uuid), private.can_score(uuid, uuid) from public, anon;
grant execute on function private.area_ok(text), private.area_name(text), private.checked_in_at(uuid, uuid), private.can_score(uuid, uuid) to authenticated;
