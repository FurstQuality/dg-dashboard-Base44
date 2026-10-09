ALTER TABLE public.tracker_groups
  ADD COLUMN IF NOT EXISTS is_all_time boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tracker_groups_one_all_time_per_owner
  ON public.tracker_groups (owner_id)
  WHERE is_all_time;