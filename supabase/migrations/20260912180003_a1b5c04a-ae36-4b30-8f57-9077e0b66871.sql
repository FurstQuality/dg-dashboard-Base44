-- Enums
create type public.contribution_kind as enum (
  'course_created','layout_mapped','hole_pinned','course_fully_mapped','course_edit','course_photo',
  'tee_sign','duplicate_merge','hole_data_verified','condition_report_verified','club_created',
  'event_hosted','player_invited','review_credit','other'
);
create type public.contribution_status as enum ('pending','verified','rejected','expired');
create type public.verification_vote as enum ('approve','reject');
create type public.course_report_kind as enum (
  'fallen_tree','hazard','flooding','construction','closed','basket_missing','basket_moved',
  'tee_damage','obstacle','signage','other'
);
create type public.course_report_status as enum ('open','confirmed','resolved','expired');
create type public.course_report_vote_kind as enum ('confirm','resolved','not_found');
create type public.redemption_status as enum ('pending','approved','rejected','granted');

-- Points catalog
create or replace function public.contribution_points_for(_kind public.contribution_kind)
returns integer
language sql
immutable
set search_path = public
as $$
  select case _kind
    when 'course_created' then 150
    when 'layout_mapped' then 100
    when 'hole_pinned' then 10
    when 'course_fully_mapped' then 250
    when 'course_edit' then 25
    when 'course_photo' then 15
    when 'tee_sign' then 20
    when 'duplicate_merge' then 40
    when 'hole_data_verified' then 10
    when 'condition_report_verified' then 15
    when 'club_created' then 100
    when 'event_hosted' then 75
    when 'player_invited' then 50
    when 'review_credit' then 5
    else 0
  end
$$;

-- Contributions
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.contribution_kind not null,
  course_id uuid references public.courses(id) on delete set null,
  layout_id uuid references public.course_layouts(id) on delete set null,
  hole_id uuid references public.holes(id) on delete set null,
  quantity integer not null default 1 check (quantity between 1 and 36),
  points integer not null default 0,
  summary text not null,
  details text,
  evidence_url text,
  status public.contribution_status not null default 'pending',
  approve_count integer not null default 0,
  reject_count integer not null default 0,
  verified_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contributions_user_idx on public.contributions (user_id, created_at desc);
create index contributions_status_idx on public.contributions (status, created_at desc);
create index contributions_course_idx on public.contributions (course_id);

grant select, insert, update, delete on public.contributions to authenticated;
grant all on public.contributions to service_role;
alter table public.contributions enable row level security;

create policy "Signed-in players can read contributions"
  on public.contributions for select to authenticated using (true);
create policy "Players submit their own contributions"
  on public.contributions for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "Players edit their own pending contributions"
  on public.contributions for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');
create policy "Admins review contributions"
  on public.contributions for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));
create policy "Players remove their own pending contributions"
  on public.contributions for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

create trigger contributions_updated_at
  before update on public.contributions
  for each row execute function public.update_updated_at_column();

create or replace function public.contributions_set_points()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.points := public.contribution_points_for(new.kind) * new.quantity;
  return new;
end;
$$;

create trigger contributions_points
  before insert or update of kind, quantity on public.contributions
  for each row execute function public.contributions_set_points();

-- Peer verifications
create table public.contribution_verifications (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions(id) on delete cascade,
  verifier_id uuid not null references auth.users(id) on delete cascade,
  vote public.verification_vote not null,
  note text,
  created_at timestamptz not null default now(),
  unique (contribution_id, verifier_id)
);
create index contribution_verifications_contribution_idx on public.contribution_verifications (contribution_id);

grant select, insert on public.contribution_verifications to authenticated;
grant all on public.contribution_verifications to service_role;
alter table public.contribution_verifications enable row level security;

create policy "Signed-in players can read verifications"
  on public.contribution_verifications for select to authenticated using (true);
create policy "Players record their own verification"
  on public.contribution_verifications for insert to authenticated
  with check (verifier_id = auth.uid());

create or replace function public.contribution_award_badges(_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_courses integer;
  v_holes integer;
  v_reviews integer;
  v_community integer;
  v_reports integer;
begin
  select coalesce(count(*), 0) into v_courses
    from public.contributions
    where user_id = _user and status = 'verified' and kind in ('course_created','course_fully_mapped');
  select coalesce(sum(quantity), 0) into v_holes
    from public.contributions
    where user_id = _user and status = 'verified' and kind = 'hole_pinned';
  select coalesce(count(*), 0) into v_reviews
    from public.contribution_verifications where verifier_id = _user;
  select coalesce(count(*), 0) into v_community
    from public.contributions
    where user_id = _user and status = 'verified' and kind in ('club_created','event_hosted','player_invited');
  select coalesce(count(*), 0) into v_reports
    from public.contributions
    where user_id = _user and status = 'verified' and kind = 'condition_report_verified';

  if v_courses >= 1 and exists (select 1 from public.achievements where key = 'builder_first_course') then
    perform public.award_achievement(_user, 'builder_first_course');
  end if;
  if v_courses >= 10 and exists (select 1 from public.achievements where key = 'builder_ten_courses') then
    perform public.award_achievement(_user, 'builder_ten_courses');
  end if;
  if v_holes >= 100 and exists (select 1 from public.achievements where key = 'mapper_hundred_holes') then
    perform public.award_achievement(_user, 'mapper_hundred_holes');
  end if;
  if v_reviews >= 25 and exists (select 1 from public.achievements where key = 'trusted_reviewer') then
    perform public.award_achievement(_user, 'trusted_reviewer');
  end if;
  if v_community >= 5 and exists (select 1 from public.achievements where key = 'community_grower') then
    perform public.award_achievement(_user, 'community_grower');
  end if;
  if v_reports >= 10 and exists (select 1 from public.achievements where key = 'condition_scout') then
    perform public.award_achievement(_user, 'condition_scout');
  end if;
end;
$$;

create or replace function public.on_contribution_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status public.contribution_status;
  v_approve integer;
  v_reject integer;
  v_points integer;
begin
  select user_id, status, points into v_owner, v_status, v_points
    from public.contributions where id = new.contribution_id;
  if v_owner is null then
    raise exception 'Contribution not found';
  end if;
  if v_owner = new.verifier_id then
    raise exception 'You cannot verify your own contribution';
  end if;
  if v_status <> 'pending' then
    raise exception 'This contribution has already been decided';
  end if;

  select count(*) filter (where vote = 'approve'), count(*) filter (where vote = 'reject')
    into v_approve, v_reject
    from public.contribution_verifications where contribution_id = new.contribution_id;

  update public.contributions
    set approve_count = v_approve,
        reject_count = v_reject,
        status = case
          when v_approve >= 2 then 'verified'::public.contribution_status
          when v_reject >= 2 then 'rejected'::public.contribution_status
          else status end,
        verified_at = case when v_approve >= 2 then now() else verified_at end
    where id = new.contribution_id;

  if v_approve >= 2 then
    perform public.award_xp(v_owner, 'contribution_verified', greatest(v_points, 10), 'contribution', new.contribution_id::text, jsonb_build_object('points', v_points));
    perform public.contribution_award_badges(v_owner);
  end if;
  perform public.contribution_award_badges(new.verifier_id);
  return new;
end;
$$;

create trigger contribution_verifications_apply
  after insert on public.contribution_verifications
  for each row execute function public.on_contribution_verification();

-- Redemptions
create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points_spent integer not null check (points_spent > 0),
  months_requested integer not null check (months_requested between 1 and 12),
  tier_key text not null default 'pro',
  status public.redemption_status not null default 'pending',
  note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  granted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reward_redemptions_user_idx on public.reward_redemptions (user_id, created_at desc);
create index reward_redemptions_status_idx on public.reward_redemptions (status, created_at desc);

grant select, insert on public.reward_redemptions to authenticated;
grant update on public.reward_redemptions to authenticated;
grant all on public.reward_redemptions to service_role;
alter table public.reward_redemptions enable row level security;

create policy "Players read their own redemptions"
  on public.reward_redemptions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));
create policy "Players request their own redemptions"
  on public.reward_redemptions for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "Admins decide redemptions"
  on public.reward_redemptions for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

create trigger reward_redemptions_updated_at
  before update on public.reward_redemptions
  for each row execute function public.update_updated_at_column();

-- Balance
create or replace function public.contribution_balance(_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select sum(points) from public.contributions where user_id = _user_id and status = 'verified'), 0)
    - coalesce((select sum(points_spent) from public.reward_redemptions where user_id = _user_id and status in ('pending','approved','granted')), 0)
  , 0)::integer
$$;

grant execute on function public.contribution_balance(uuid) to authenticated, service_role;

-- Public leaderboard
create or replace function public.contribution_leaderboard(_limit integer default 25)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  points integer,
  verified_count integer,
  courses_built integer,
  holes_mapped integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id,
         p.username,
         p.display_name,
         p.avatar_url,
         sum(c.points)::integer as points,
         count(*)::integer as verified_count,
         count(*) filter (where c.kind in ('course_created','course_fully_mapped'))::integer as courses_built,
         coalesce(sum(c.quantity) filter (where c.kind = 'hole_pinned'), 0)::integer as holes_mapped
  from public.contributions c
  join public.profiles p on p.id = c.user_id
  where c.status = 'verified'
  group by c.user_id, p.username, p.display_name, p.avatar_url
  order by points desc, verified_count desc
  limit least(greatest(coalesce(_limit, 25), 1), 100)
$$;

grant execute on function public.contribution_leaderboard(integer) to anon, authenticated, service_role;

-- Live course condition reports
create table public.course_reports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  hole_id uuid references public.holes(id) on delete set null,
  hole_number integer check (hole_number between 1 and 36),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  kind public.course_report_kind not null,
  severity text not null default 'moderate' check (severity in ('minor','moderate','blocking')),
  description text,
  lat double precision,
  lng double precision,
  status public.course_report_status not null default 'open',
  confirm_count integer not null default 0,
  resolved_count integer not null default 0,
  not_found_count integer not null default 0,
  credited boolean not null default false,
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '45 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_reports_course_idx on public.course_reports (course_id, status, created_at desc);
create index course_reports_reporter_idx on public.course_reports (reporter_id, created_at desc);

grant select on public.course_reports to anon;
grant select, insert, update, delete on public.course_reports to authenticated;
grant all on public.course_reports to service_role;
alter table public.course_reports enable row level security;

create policy "Anyone can read live course conditions"
  on public.course_reports for select to anon
  using (status in ('open','confirmed') and expires_at > now());
create policy "Signed-in players read course conditions"
  on public.course_reports for select to authenticated using (true);
create policy "Players report course conditions"
  on public.course_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "Reporters update their own report"
  on public.course_reports for update to authenticated
  using (reporter_id = auth.uid()) with check (reporter_id = auth.uid());
create policy "Admins manage course reports"
  on public.course_reports for update to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));
create policy "Reporters delete their own report"
  on public.course_reports for delete to authenticated
  using (reporter_id = auth.uid());

create trigger course_reports_updated_at
  before update on public.course_reports
  for each row execute function public.update_updated_at_column();

create table public.course_report_votes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.course_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote public.course_report_vote_kind not null,
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);
create index course_report_votes_report_idx on public.course_report_votes (report_id);

grant select, insert on public.course_report_votes to authenticated;
grant all on public.course_report_votes to service_role;
alter table public.course_report_votes enable row level security;

create policy "Signed-in players read report votes"
  on public.course_report_votes for select to authenticated using (true);
create policy "Players cast their own report vote"
  on public.course_report_votes for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.on_course_report_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.course_reports;
  v_confirm integer;
  v_resolved integer;
  v_not_found integer;
begin
  select * into v_report from public.course_reports where id = new.report_id;
  if v_report.id is null then
    raise exception 'Report not found';
  end if;
  if v_report.reporter_id = new.user_id then
    raise exception 'You cannot vote on your own report';
  end if;

  select count(*) filter (where vote = 'confirm'),
         count(*) filter (where vote = 'resolved'),
         count(*) filter (where vote = 'not_found')
    into v_confirm, v_resolved, v_not_found
    from public.course_report_votes where report_id = new.report_id;

  update public.course_reports
    set confirm_count = v_confirm,
        resolved_count = v_resolved,
        not_found_count = v_not_found,
        status = case
          when v_resolved >= 2 then 'resolved'::public.course_report_status
          when v_not_found >= 2 then 'expired'::public.course_report_status
          when v_confirm >= 2 then 'confirmed'::public.course_report_status
          else status end,
        resolved_at = case when v_resolved >= 2 then now() else resolved_at end
    where id = new.report_id;

  if v_confirm >= 2 and not v_report.credited then
    insert into public.contributions (user_id, kind, course_id, hole_id, summary, details, status, approve_count, verified_at)
    values (v_report.reporter_id, 'condition_report_verified', v_report.course_id, v_report.hole_id,
            'Verified course condition report', v_report.description, 'verified', v_confirm, now());
    update public.course_reports set credited = true where id = new.report_id;
    perform public.contribution_award_badges(v_report.reporter_id);
  end if;
  return new;
end;
$$;

create trigger course_report_votes_apply
  after insert on public.course_report_votes
  for each row execute function public.on_course_report_vote();