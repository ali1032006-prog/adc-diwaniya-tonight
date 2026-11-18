-- Tonight's draw fills tonight's tables in the order the TV and the phone list them (by label),
-- not the order they were added in (two tables added together had no fixed order).
-- Same signature, so the grants stay. Test: supabase/tests/tv_room_test.sql (red first: Table B came first).
create or replace function public.tv_draw(p_night uuid, p_names text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n public.nights; v_names text[]; v_no int; v_tables jsonb := '[]'::jsonb; v_left text[];
  t record; v_seats jsonb; s int; k int := 0; v_total int; v_result jsonb; v_virtual int;
begin
  n := private.tv_night(p_night);
  if n.status <> 'open' then raise exception 'open tonight''s night first' using errcode = '22023'; end if;
  select array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g')) into v_names from unnest(coalesce(p_names, '{}')) x;
  if coalesce(array_length(v_names, 1), 0) < 2 or array_length(v_names, 1) > 36 then
    raise exception 'pick between 2 and 36 names' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_names) x where char_length(x) not between 1 and 40 or x ~ '[[:cntrl:]]') then
    raise exception 'each name is 1 to 40 letters' using errcode = '22023';
  end if;
  if (select count(distinct lower(x)) from unnest(v_names) x) <> array_length(v_names, 1) then
    raise exception 'a name is in the draw twice' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('tvdraw:' || n.id::text));
  select coalesce(max(no), 0) + 1 into v_no from private.tv_draws where night_id = n.id;
  if v_no > 20 then raise exception 'twenty draws a night at most' using errcode = '54000'; end if;

  -- the fair part: a strong random order (gen_random_uuid is v4, from the OS's CSPRNG)
  select array_agg(x order by gen_random_uuid()) into v_names from unnest(v_names) x;
  v_total := array_length(v_names, 1);

  for t in
    select g.game, g.seat_count, g.label from public.game_tables g where g.night_id = n.id order by g.label, g.created_at, g.id
  loop
    exit when k >= v_total;
    v_seats := '[]'::jsonb;
    for s in 1..t.seat_count loop
      exit when k >= v_total;
      k := k + 1;
      v_seats := v_seats || jsonb_build_object('seat', s, 'name', v_names[k],
                   'team', case when t.game = 'trix' then s else 2 - s % 2 end);
    end loop;
    v_tables := v_tables || jsonb_build_object('label', t.label, 'game', t.game, 'seats', v_seats);
  end loop;
  -- no tables yet: tables of four (two teams of two), the rest wait
  if jsonb_array_length(v_tables) = 0 then
    v_virtual := greatest(1, v_total / 4);
    for t in select i from generate_series(1, v_virtual) i loop
      v_seats := '[]'::jsonb;
      for s in 1..4 loop
        exit when k >= v_total;
        k := k + 1;
        v_seats := v_seats || jsonb_build_object('seat', s, 'name', v_names[k], 'team', 2 - s % 2);
      end loop;
      v_tables := v_tables || jsonb_build_object('label', '', 'game', null, 'seats', v_seats);
    end loop;
  end if;
  v_left := coalesce(v_names[k + 1:], '{}');
  v_result := jsonb_build_object('no', v_no, 'at', now(), 'tables', v_tables, 'waiting', to_jsonb(v_left));
  insert into private.tv_draws (night_id, no, made_by, result) values (n.id, v_no, auth.uid(), v_result);
  perform private.tv_ping(n.diwaniya_id);
  return v_result;
end $$;
