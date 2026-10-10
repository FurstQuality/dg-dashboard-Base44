create or replace function public.set_hole_pin(_hole uuid, _pin text)
returns void language plpgsql security definer set search_path = public as $$
declare _course uuid; _layout uuid; _prev text; _main text;
begin
  select cl.course_id, h.layout_id, h.basket_name into _course, _layout, _main from holes h join course_layouts cl on cl.id = h.layout_id where h.id = _hole;
  if _course is null then raise exception 'Hole not found'; end if;
  if not (public.can_steward_course(_course, auth.uid()) or public.can_edit_layout(_layout, auth.uid())) then
    raise exception 'Only course stewards can set the current pin';
  end if;
  if not (exists (select 1 from hole_baskets where hole_id = _hole and name = _pin) or coalesce(_main, 'A') = _pin) then
    raise exception 'That basket position is not on this hole';
  end if;
  select pin_name into _prev from hole_pin_placements where hole_id = _hole order by set_at desc limit 1;
  insert into hole_pin_placements(hole_id, pin_name, previous_pin, set_by) values (_hole, _pin, _prev, auth.uid());
end $$;