-- Phase 1 Friend Tracker foundation: extend metadata + add change log

ALTER TABLE public.tracker_groups
  ADD COLUMN IF NOT EXISTS time_zone text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS from_crew_id uuid,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE public.tracker_group_events
  ADD COLUMN IF NOT EXISTS sanctioning_tier text,
  ADD COLUMN IF NOT EXISTS event_classification text,
  ADD COLUMN IF NOT EXISTS event_status text,
  ADD COLUMN IF NOT EXISTS time_zone text,
  ADD COLUMN IF NOT EXISTS registration_url text,
  ADD COLUMN IF NOT EXISTS results_url text,
  ADD COLUMN IF NOT EXISTS start_type text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error text;

ALTER TABLE public.tracker_event_rounds
  ADD COLUMN IF NOT EXISTS start_type text,
  ADD COLUMN IF NOT EXISTS tee_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS start_window_start text,
  ADD COLUMN IF NOT EXISTS start_window_end text,
  ADD COLUMN IF NOT EXISTS pool text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.tracker_tee_times
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE TABLE IF NOT EXISTS public.tracker_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.tracker_groups(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.tracker_group_events(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.tracker_group_members(id) ON DELETE CASCADE,
  field text NOT NULL,
  from_value text,
  to_value text,
  source text NOT NULL DEFAULT 'sync',
  actor_id uuid,
  severity text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_change_log TO authenticated;
GRANT ALL ON public.tracker_change_log TO service_role;

ALTER TABLE public.tracker_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages tracker_change_log" ON public.tracker_change_log;
CREATE POLICY "Owner manages tracker_change_log"
  ON public.tracker_change_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tracker_groups g WHERE g.id = tracker_change_log.group_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_groups g WHERE g.id = tracker_change_log.group_id AND g.owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS tracker_change_log_group_idx ON public.tracker_change_log(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracker_change_log_event_idx ON public.tracker_change_log(event_id, created_at DESC);