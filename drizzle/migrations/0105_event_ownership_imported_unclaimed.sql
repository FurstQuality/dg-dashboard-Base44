create or replace function public.guard_event_ownership_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  _kind text := case TG_TABLE_NAME when 'leagues' then 'league' else 'tournament' end;
begin
  if coalesce(current_setting('dgd.ownership_change', true), '') = 'on' then return new; end if;
  if (new.owner_id is distinct from old.owner_id or new.club_id is distinct from old.club_id)
     and not public.controls_event_access(_kind, old.id, auth.uid()) then
    raise exception 'Only the owner or club admins can change who runs this event';
  end if;
  return new;
end;
$function$;

alter table public.tournaments alter column owner_id drop not null;
alter table public.event_series alter column owner_id drop not null;
alter table public.tournaments add column if not exists management_status text not null default 'owned'
  check (management_status in ('owned','organization_owned','claimed','unclaimed_external','platform_managed','locked','ownership_review_required'));
alter table public.event_series add column if not exists management_status text not null default 'owned'
  check (management_status in ('owned','organization_owned','claimed','unclaimed_external','platform_managed','locked','ownership_review_required'));

select set_config('dgd.ownership_change', 'on', true);
update public.tournaments set owner_id = null, management_status = 'unclaimed_external'
  where imported_source is not null;
update public.event_series s set owner_id = null, management_status = 'unclaimed_external'
  where exists (select 1 from public.tournaments t where t.series_id = s.id)
    and not exists (select 1 from public.tournaments t where t.series_id = s.id and t.imported_source is null);
delete from public.tournament_staff ts using public.tournaments t
  where ts.tournament_id = t.id and t.management_status = 'unclaimed_external';
select set_config('dgd.ownership_change', '', true);

-- Importing never makes the importer an owner; management_status changes only via claim/admin.
create or replace function public.guard_event_management_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('dgd.ownership_change', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if tg_table_name = 'tournaments' and new.imported_source is not null then
      new.owner_id := null;
      new.management_status := 'unclaimed_external';
    elsif new.management_status <> 'owned' then
      new.management_status := 'owned';
    end if;
    return new;
  end if;
  if new.management_status is distinct from old.management_status then
    raise exception 'Event management status changes only through an approved claim';
  end if;
  if old.management_status = 'unclaimed_external' and new.owner_id is not null then
    raise exception 'Imported events can only gain an owner through an approved claim';
  end if;
  return new;
end $$;
drop trigger if exists guard_event_management_status on public.tournaments;
create trigger guard_event_management_status before insert or update on public.tournaments
  for each row execute function public.guard_event_management_status();
drop trigger if exists guard_event_management_status on public.event_series;
create trigger guard_event_management_status before insert or update on public.event_series
  for each row execute function public.guard_event_management_status();

create table public.event_claim_requests (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  evidence text not null check (char_length(evidence) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','verified','approved','rejected','revoked')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create unique index event_claim_one_open on public.event_claim_requests (tournament_id, user_id) where status = 'pending';
create index event_claim_requests_status_idx on public.event_claim_requests (status, created_at);
grant select, insert on public.event_claim_requests to authenticated;
grant all on public.event_claim_requests to service_role;
alter table public.event_claim_requests enable row level security;
create policy "Claimants and admins read claims" on public.event_claim_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));
create policy "Players file their own claims" on public.event_claim_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.management_status = 'unclaimed_external'));

create or replace function public.review_event_claim(_claim uuid, _approve boolean, _note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.event_claim_requests;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin')) then
    raise exception 'Only platform admins can review event claims';
  end if;
  select * into c from public.event_claim_requests where id = _claim for update;
  if c.id is null or c.status <> 'pending' then raise exception 'This claim is no longer open'; end if;
  update public.event_claim_requests set status = case when _approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(_note, 1000) where id = _claim;
  if _approve then
    perform set_config('dgd.ownership_change', 'on', true);
    update public.tournaments set owner_id = c.user_id, management_status = 'claimed' where id = c.tournament_id;
    perform set_config('dgd.ownership_change', '', true);
    update public.event_claim_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = 'Another claim for this event was approved' where tournament_id = c.tournament_id and status = 'pending';
  end if;
end $$;
revoke all on function public.review_event_claim(uuid, boolean, text) from public, anon;
grant execute on function public.review_event_claim(uuid, boolean, text) to authenticated;