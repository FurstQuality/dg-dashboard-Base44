
-- 1. Scratch rating anchor on the layout
ALTER TABLE public.course_layouts
  ADD COLUMN IF NOT EXISTS scratch_rating integer NOT NULL DEFAULT 950,
  ADD COLUMN IF NOT EXISTS stroke_value numeric NOT NULL DEFAULT 10;

-- 2. Round ratings table
CREATE TABLE IF NOT EXISTS public.round_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL REFERENCES public.round_players(id) ON DELETE CASCADE,
  user_id uuid,
  guest_name text,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  layout_id uuid NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  holes_played integer NOT NULL,
  layout_hole_count integer NOT NULL,
  total_strokes integer NOT NULL,
  par_total integer NOT NULL,
  score_to_par integer NOT NULL,
  round_rating integer NOT NULL,
  pdga_rating_at_time integer,
  scratch_rating integer NOT NULL,
  stroke_value numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, round_player_id)
);

CREATE INDEX IF NOT EXISTS round_ratings_user_idx ON public.round_ratings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS round_ratings_course_idx ON public.round_ratings(course_id, round_rating DESC);
CREATE INDEX IF NOT EXISTS round_ratings_layout_idx ON public.round_ratings(layout_id, round_rating DESC);

GRANT SELECT ON public.round_ratings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.round_ratings TO authenticated;
GRANT ALL ON public.round_ratings TO service_role;

ALTER TABLE public.round_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Round ratings are public"
  ON public.round_ratings FOR SELECT
  USING (true);

CREATE POLICY "Round creator can insert ratings"
  ON public.round_ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid())
  );

CREATE POLICY "Round creator can update ratings"
  ON public.round_ratings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid())
  );

CREATE POLICY "Round creator can delete ratings"
  ON public.round_ratings FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid())
  );

-- Helper: average of a user's most recent 8 ratings (PDGA-style rolling window)
CREATE OR REPLACE FUNCTION public.player_rating_average(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH last8 AS (
    SELECT round_rating
    FROM public.round_ratings
    WHERE user_id = _user_id
    ORDER BY created_at DESC
    LIMIT 8
  )
  SELECT COALESCE(ROUND(AVG(round_rating))::int, 0) FROM last8;
$$;
