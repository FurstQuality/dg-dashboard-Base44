
ALTER TABLE public.tracker_group_events
  ADD COLUMN IF NOT EXISTS live_scoring_url text,
  ADD COLUMN IF NOT EXISTS live_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_current_round int,
  ADD COLUMN IF NOT EXISTS live_status text;

CREATE TABLE IF NOT EXISTS public.tracker_live_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.tracker_group_events(id) ON DELETE CASCADE,
  pdga_number text NOT NULL,
  member_id uuid REFERENCES public.tracker_group_members(id) ON DELETE SET NULL,
  division text,
  round_number int,
  place int,
  running_place int,
  round_score int,
  round_to_par int,
  total int,
  to_par int,
  thru int,
  hole_scores jsonb,
  completed boolean NOT NULL DEFAULT false,
  round_started boolean NOT NULL DEFAULT false,
  tee_time text,
  card_number text,
  player_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, pdga_number, round_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_live_scores TO authenticated;
GRANT ALL ON public.tracker_live_scores TO service_role;

ALTER TABLE public.tracker_live_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages tracker_live_scores"
  ON public.tracker_live_scores
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tracker_group_events e
    JOIN public.tracker_groups g ON g.id = e.group_id
    WHERE e.id = tracker_live_scores.event_id AND g.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tracker_group_events e
    JOIN public.tracker_groups g ON g.id = e.group_id
    WHERE e.id = tracker_live_scores.event_id AND g.owner_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_tracker_live_scores_event ON public.tracker_live_scores (event_id, round_number);
CREATE INDEX IF NOT EXISTS idx_tracker_live_scores_member ON public.tracker_live_scores (member_id);
