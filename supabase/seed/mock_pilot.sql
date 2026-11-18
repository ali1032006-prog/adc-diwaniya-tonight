-- Mock pilot data for Diwaniyatna (Ali's ruling F, ADC-LOG-697: "come up with a mock yourself").
-- No real diwaniyas, people or addresses: every name here is made up, every pin is a rough point in
-- the named area, and every "about" says it is sample data. Dev project only.
--
-- Re-runnable: it first deletes the previous mock accounts (mock-NN@example.invalid); their
-- profiles, diwaniyas, nights, seats, requests and league rows go with them (ON DELETE CASCADE).
-- Tonight's nights are dated to the day it runs (Kuwait time), so run it again on a later day.
-- The mock accounts have no password and no Google identity: nobody can sign in as them.
--
-- Run: SUPABASE_ENV_FILE=<env file> python3 scripts/sql_test.py supabase/seed/mock_pilot.sql
begin;

delete from auth.users where email like 'mock-%@example.invalid';

create temporary table m_people (n int primary key, id uuid, name text, area text, born date) on commit drop;
insert into m_people (n, name, area, born)
values
  (1, 'بو فيصل', 'العديلية', date '1968-03-12'),
  (2, 'سالم', 'السالمية', date '1979-07-02'),
  (3, 'بو ناصر', 'الجهراء', date '1971-11-20'),
  (4, 'حمد', 'الفنطاس', date '1985-01-30'),
  (5, 'بو يوسف', 'الروضة', date '1966-05-05'),
  (6, 'فهد', 'العديلية', date '1990-09-14'),
  (7, 'جاسم', 'مشرف', date '1988-12-01'),
  (8, 'بدر', 'السالمية', date '1995-04-22'),
  (9, 'مشاري', 'الجهراء', date '1993-08-08'),
  (10, 'عبدالله', 'الروضة', date '1982-02-17'),
  (11, 'طلال', 'الفنطاس', date '1999-10-10'),
  (12, 'Yousef K.', 'Salmiya', date '1991-06-06'),
  (13, 'ناصر', 'السالمية', date '1987-03-03'),
  (14, 'خالد', 'مشرف', date '1976-09-19'),
  (15, 'سعود', 'السالمية', date '1998-01-25'),
  (16, 'عيسى', 'العديلية', date '2001-07-07'),
  (17, 'راشد', 'الجهراء', date '1984-04-14'),
  (18, 'منصور', 'الجهراء', date '1990-02-02'),
  (19, 'أحمد', 'الجهراء', date '1994-11-11'),
  (20, 'Omar S.', 'Fintas', date '1992-05-15');
update m_people set id = ('d0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid;

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       'mock-' || lpad(n::text, 2, '0') || '@example.invalid',
       '{"provider":"mock","providers":["mock"]}', jsonb_build_object('mock', true),
       now() - make_interval(days => 40 - n), now(), '', '', '', ''
from m_people;

insert into public.profiles (id, display_name, area, games, created_at)
select id, name, area,
       case n % 4 when 0 then array['kout','baloot'] when 1 then array['kout'] when 2 then array['baloot','tarneeb']
                  else array['kout','trix'] end,
       now() - make_interval(days => 40 - n)
from m_people;

insert into public.profile_private (user_id, birth_date, terms_accepted_at, male_confirmed_at, ping_games, ping_areas)
select id, born, now() - make_interval(days => 40 - n), now() - make_interval(days => 40 - n),
       array['kout'], array[area]
from m_people;

-- Five sample diwaniyas, all men only by rule (no audience setting exists).
create temporary table m_dw (k int primary key, id uuid, host int, name text, area text, visibility text,
                             approval text, slot text, lat numeric, lng numeric, opens time) on commit drop;
insert into m_dw values
  (1, 'd1000000-0000-4000-8000-000000000001', 1, 'ديوانية بو فيصل', 'العديلية', 'public', 'regulars_auto', 'كل ليلة بعد العشاء', 29.3291, 47.9826, '20:30'),
  (2, 'd1000000-0000-4000-8000-000000000002', 2, 'ديوانية السدرة', 'السالمية', 'public', 'host', 'الخميس والجمعة', 29.3339, 48.0761, '21:00'),
  (3, 'd1000000-0000-4000-8000-000000000003', 3, 'ديوانية الفريج', 'الجهراء', 'followers', 'host', 'الأحد والأربعاء', 29.3375, 47.6581, '20:00'),
  (4, 'd1000000-0000-4000-8000-000000000004', 4, 'ديوانية البحر', 'الفنطاس', 'public', 'regulars_auto', 'نهاية الأسبوع', 29.1736, 48.1183, '21:30'),
  (5, 'd1000000-0000-4000-8000-000000000005', 5, 'ديوانية الروضة', 'الروضة', 'public', 'host', 'الاثنين', 29.3302, 47.9997, null);

insert into public.diwaniyas (id, host_id, name, area, about, rules, visibility, approval, guest_cap, pin_unlock_minutes, usual_slot)
select d.id, p.id, d.name, d.area,
       'بيانات تجريبية: ديوانية غير حقيقية لتجربة التطبيق. Sample data, not a real place.',
       'لا رهان ولا فلوس. الشاي والقهوة علينا. احترم الدور على الطاولة.',
       d.visibility, d.approval, 4, 60, d.slot
from m_dw d join m_people p on p.n = d.host;

insert into public.diwaniya_pins (diwaniya_id, lat, lng, directions)
select id, lat, lng, 'موقع تقريبي تجريبي' from m_dw;

insert into public.cohosts (diwaniya_id, user_id, accepted_at)
select d.id, p.id, now() from m_dw d join m_people p on p.n = 6 where d.k = 1;

insert into public.regulars (diwaniya_id, user_id)
select d.id, p.id from m_dw d join m_people p on (d.k, p.n) in ((1,6),(1,7),(1,10),(2,8),(2,12),(3,9),(4,11),(4,7),(5,10),(5,1));

insert into public.follows (user_id, diwaniya_id)
select p.id, d.id from m_dw d join m_people p on (d.k, p.n) in ((1,8),(1,9),(2,6),(3,1),(3,11),(4,2),(5,6),(5,12));

-- Tonight (Kuwait date of the run) for the four diwaniyas that open tonight.
insert into public.nights (id, diwaniya_id, starts_at)
select ('d2000000-0000-4000-8000-00000000000' || d.k)::uuid, d.id,
       ((now() at time zone 'Asia/Kuwait')::date + d.opens) at time zone 'Asia/Kuwait'
from m_dw d where d.opens is not null;

-- Tables: game, seats, label, need-one flag, who sits (mock people by number, or a walk-in name).
create temporary table m_tab (id uuid, k int, game text, seats int, label text, need boolean, sit int[], walkin text) on commit drop;
insert into m_tab values
  ('d3000000-0000-4000-8000-000000000011', 1, 'kout', 6, 'الطاولة الكبيرة', true, array[1,6,7,10], null),
  ('d3000000-0000-4000-8000-000000000012', 1, 'baloot', 4, 'بلوت', false, array[8,9], 'بو خالد'),
  ('d3000000-0000-4000-8000-000000000021', 2, 'baloot', 4, '', true, array[2,12,13], null),
  ('d3000000-0000-4000-8000-000000000022', 2, 'tarneeb', 4, 'طرنيب', false, array[14], 'ضيف'),
  ('d3000000-0000-4000-8000-000000000031', 3, 'kout', 6, '', false, array[3,17,18,19,5], null),
  ('d3000000-0000-4000-8000-000000000041', 4, 'trix', 4, 'تركس', false, array[4,11,20], 'بو سعود');

insert into public.game_tables (id, night_id, game, seat_count, label, need_one, need_one_at)
select t.id, ('d2000000-0000-4000-8000-00000000000' || t.k)::uuid, t.game, t.seats, t.label, t.need,
       case when t.need then now() - interval '5 minutes' end
from m_tab t;

-- A person sits once per night: the mock tables above never repeat someone within one diwaniya.
insert into public.seats (table_id, seat_no, user_id)
select t.id, s.ord, p.id
from m_tab t cross join lateral unnest(t.sit) with ordinality as s(n, ord) join m_people p on p.n = s.n;
insert into public.seats (table_id, seat_no, walk_in_name)
select t.id, cardinality(t.sit) + 1, t.walkin from m_tab t where t.walkin is not null;

-- Guests who came through the app: two arrived and seated, one approved on the way, one waiting.
-- (Mock people can't sign in, so only reliability counts and seat rings show these to testers.)
insert into public.requests (night_id, table_id, user_id, eta_minutes, note, status, decided_at, decided_by)
select ('d2000000-0000-4000-8000-00000000000' || r.k)::uuid, r.tab::uuid, p.id, r.eta, r.note, r.status,
       case when r.status <> 'pending' then now() - interval '20 minutes' end,
       case when r.status <> 'pending' then h.id end
from (values
  (1, 'd3000000-0000-4000-8000-000000000012', 8, 0, '', 'arrived', 1),
  (2, 'd3000000-0000-4000-8000-000000000021', 15, 15, 'جاي بعد صلاة العشاء', 'approved', 2),
  (2, 'd3000000-0000-4000-8000-000000000022', 16, 30, 'أول مرة، أعرف ألعب طرنيب', 'pending', 2),
  (4, 'd3000000-0000-4000-8000-000000000041', 11, 0, '', 'arrived', 4)
) as r(k, tab, who, eta, note, status, host)
join m_people p on p.n = r.who join m_people h on h.n = r.host;

-- Fahd's neighbour waits at the big Kout table for the next free seat.
insert into public.table_queue (table_id, user_id, joined_at)
select 'd3000000-0000-4000-8000-000000000011'::uuid, id, now() - make_interval(mins => 30 - n)
from m_people where n = 9;

-- League history: 24 Kout games over the last 4 weeks at Bu Faisal's, 12 Baloot games at Al-Rawda.
insert into public.played_games (id, diwaniya_id, rule_pack, recorded_by, played_at)
select ('d4000000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       'd1000000-0000-4000-8000-000000000001', 'kout_bo6', (select id from m_people where n = 1),
       now() - make_interval(days => 28 - g, hours => 2)
from generate_series(1, 24) g;
insert into public.played_games (id, diwaniya_id, rule_pack, recorded_by, played_at)
select ('d4000000-0000-4000-8000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       'd1000000-0000-4000-8000-000000000005', 'baloot', (select id from m_people where n = 5),
       now() - make_interval(days => 26 - 2 * g, hours => 3)
from generate_series(1, 12) g;

-- Kout: six seats, odd seats team 1, even seats team 2; the rotation of who sits where and
-- who wins is fixed arithmetic, so every run gives the same table.
insert into public.game_results (game_id, seat, user_id, name, team, points, won)
select ('d4000000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, s,
       p.id, p.name, 2 - (s % 2),
       case when (2 - (s % 2)) = 1 + ((g * 7) % 3 = 0)::int then 6 else (g % 5) end,
       (2 - (s % 2)) = 1 + ((g * 7) % 3 = 0)::int
from generate_series(1, 24) g cross join generate_series(1, 6) s
join m_people p on p.n = (array[1,6,7,10,8,9,2,12])[1 + ((g + s * 3) % 8)]
where (select count(distinct (array[1,6,7,10,8,9,2,12])[1 + ((g + x * 3) % 8)]) from generate_series(1, 6) x) = 6;

-- Baloot: four seats, teams 1-2-1-2.
insert into public.game_results (game_id, seat, user_id, name, team, points, won)
select ('d4000000-0000-4000-8000-0000000002' || lpad(g::text, 2, '0'))::uuid, s,
       p.id, p.name, 2 - (s % 2),
       case when (2 - (s % 2)) = 1 + (g % 2) then 152 else 60 + (g * 13) % 80 end,
       (2 - (s % 2)) = 1 + (g % 2)
from generate_series(1, 12) g cross join generate_series(1, 4) s
join m_people p on p.n = (array[5,10,1,6,7,3])[1 + ((g + s) % 6)];

-- Games where the rotation would seat someone twice got no result rows; drop them.
delete from public.played_games pg
where pg.id::text like 'd4000000-%' and not exists (select 1 from public.game_results r where r.game_id = pg.id);

select (select count(*) from public.profiles where id::text like 'd0000000-%') as mock_people,
       (select count(*) from public.diwaniyas where id::text like 'd1000000-%') as mock_diwaniyas,
       (select count(*) from public.nights where id::text like 'd2000000-%') as nights_tonight,
       (select count(*) from public.seats s join public.game_tables t on t.id = s.table_id where t.id::text like 'd3000000-%') as seats_taken,
       (select count(*) from public.played_games where id::text like 'd4000000-%') as league_games,
       (select count(*) from public.game_results r where r.game_id::text like 'd4000000-%') as result_rows;
commit;
