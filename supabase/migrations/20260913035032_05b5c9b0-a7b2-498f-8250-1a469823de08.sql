ALTER TABLE public.tracker_group_events
  ADD COLUMN IF NOT EXISTS auto_added boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tracker_group_events_group_auto_idx
  ON public.tracker_group_events (group_id, auto_added);