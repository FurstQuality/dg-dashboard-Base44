CREATE TABLE public.round_throws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL,
  hole_number integer NOT NULL,
  throw_number integer NOT NULL,
  throw_type text NOT NULL CHECK (throw_type IN ('tee','approach','putt','other')),
  distance_zone text CHECK (distance_zone IN ('parked','c1','c2','outside','unknown')),
  lie_area text CHECK (lie_area IN ('fairway','rough','ob','hazard','other','unknown')),
  start_zone text CHECK (start_zone IN ('parked','c1','c2','outside','unknown')),
  made boolean,
  holed_out boolean NOT NULL DEFAULT false,
  stats_version text NOT NULL DEFAULT 'dgd-throw-stats-v1',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX round_throws_hole_idx ON public.round_throws(round_id, round_player_id, hole_number, throw_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_throws TO authenticated;
GRANT ALL ON public.round_throws TO service_role;
ALTER TABLE public.round_throws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view throws" ON public.round_throws FOR SELECT TO authenticated
  USING (public.is_round_participant(round_id, auth.uid()));
CREATE POLICY "Card players manage throws" ON public.round_throws FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = round_throws.round_id AND rp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = round_throws.round_id AND rp.user_id = auth.uid()));