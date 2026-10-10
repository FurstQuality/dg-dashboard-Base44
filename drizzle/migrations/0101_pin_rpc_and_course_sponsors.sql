create or replace function public.set_hole_pin(_hole uuid, _pin text)
returns void language plpgsql security definer set search_path = public as $$
declare _course uuid; _layout uuid; _prev text;
begin
  select cl.course_id, h.layout_id into _course, _layout from holes h join course_layouts cl on cl.id = h.layout_id where h.id = _hole;
  if _course is null then raise exception 'Hole not found'; end if;
  if not (public.can_steward_course(_course, auth.uid()) or public.can_edit_layout(_layout, auth.uid())) then
    raise exception 'Only course stewards can set the current pin';
  end if;
  if not exists (select 1 from hole_baskets where hole_id = _hole and name = _pin) then
    raise exception 'That basket position is not on this hole';
  end if;
  select pin_name into _prev from hole_pin_placements where hole_id = _hole order by set_at desc limit 1;
  insert into hole_pin_placements(hole_id, pin_name, previous_pin, set_by) values (_hole, _pin, _prev, auth.uid());
end $$;
revoke all on function public.set_hole_pin(uuid, text) from public, anon;
grant execute on function public.set_hole_pin(uuid, text) to authenticated;

create table public.course_sponsors (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  category text not null default 'course' check (category in ('course','hole','event','community')),
  link_url text check (link_url is null or link_url ~ '^https://'),
  hole_number int,
  sort_order int not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
grant select on public.course_sponsors to anon, authenticated;
grant insert, update, delete on public.course_sponsors to authenticated;
grant all on public.course_sponsors to service_role;
alter table public.course_sponsors enable row level security;
create index on public.course_sponsors(course_id);
create policy "Sponsors are public" on public.course_sponsors for select using (true);
create policy "Stewards manage sponsors" on public.course_sponsors for all to authenticated
  using (public.can_steward_course(course_id, auth.uid()))
  with check (public.can_steward_course(course_id, auth.uid()));