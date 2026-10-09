-- Private project reference notes; never part of public platform_config.
create table public.admin_project_settings (
  id boolean primary key default true check (id),
  knowledge text not null default '' check (length(knowledge) <= 30000),
  security_notes text not null default '' check (length(security_notes) <= 30000),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.admin_project_settings enable row level security;
revoke all on public.admin_project_settings from anon;
grant select, insert, update on public.admin_project_settings to authenticated;
create policy "Super admins read project notes" on public.admin_project_settings for select to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'));
create policy "Super admins insert project notes" on public.admin_project_settings for insert to authenticated
  with check (public.has_role((select auth.uid()), 'super_admin'));
create policy "Super admins update project notes" on public.admin_project_settings for update to authenticated
  using (public.has_role((select auth.uid()), 'super_admin')) with check (public.has_role((select auth.uid()), 'super_admin'));
create function public.save_admin_project_notes(_knowledge text, _security_notes text, _revision integer, _reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_revision integer;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin') then raise exception 'Forbidden'; end if;
  if coalesce(length(trim(_reason)), 0) < 5 then raise exception 'A reason is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin_project_settings', 0));
  select revision into v_revision from public.admin_project_settings where id = true for update;
  if coalesce(v_revision, 0) <> _revision then raise exception 'Project notes changed. Reload before saving.'; end if;
  insert into public.admin_project_settings(id, knowledge, security_notes, revision, updated_by)
  values(true, _knowledge, _security_notes, _revision + 1, auth.uid())
  on conflict (id) do update set knowledge = excluded.knowledge, security_notes = excluded.security_notes,
    revision = excluded.revision, updated_by = excluded.updated_by, updated_at = now();
  perform public.log_admin_override('project_notes_update', 'admin_project_settings', 'project',
    jsonb_build_object('revision', _revision), jsonb_build_object('revision', _revision + 1), _reason);
  return _revision + 1;
end $$;
revoke execute on function public.save_admin_project_notes(text,text,integer,text) from public, anon;
grant execute on function public.save_admin_project_notes(text,text,integer,text) to authenticated;
