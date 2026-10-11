create table public.clubhouse_checkins (
  user_id uuid not null default auth.uid(),
  room_key text not null check (char_length(room_key) <= 120),
  status text not null default 'looking' check (status in ('looking','playing','hanging')),
  display_name text not null default 'Player' check (char_length(display_name) <= 80),
  avatar_url text,
  checked_in_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, room_key)
);
create index clubhouse_checkins_room_idx on public.clubhouse_checkins (room_key, checked_in_at);
grant select, insert, update, delete on public.clubhouse_checkins to authenticated;
grant all on public.clubhouse_checkins to service_role;
alter table public.clubhouse_checkins enable row level security;
create policy "Signed-in players see the clubhouse" on public.clubhouse_checkins for select to authenticated using (true);
create policy "Players check themselves in" on public.clubhouse_checkins for insert to authenticated with check (auth.uid() = user_id);
create policy "Players update their own status" on public.clubhouse_checkins for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Players leave on their own" on public.clubhouse_checkins for delete to authenticated using (auth.uid() = user_id);
alter publication supabase_realtime add table public.clubhouse_checkins;