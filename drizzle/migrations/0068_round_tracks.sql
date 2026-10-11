CREATE TABLE public.round_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  distance_m numeric NOT NULL DEFAULT 0,
  elevation_gain_m numeric NOT NULL DEFAULT 0,
  elevation_loss_m numeric NOT NULL DEFAULT 0,
  steps integer NOT NULL DEFAULT 0,
  calories integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_tracks TO authenticated;
GRANT ALL ON public.round_tracks TO service_role;
ALTER TABLE public.round_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players manage their own round track" ON public.round_tracks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX round_tracks_user_idx ON public.round_tracks(user_id);