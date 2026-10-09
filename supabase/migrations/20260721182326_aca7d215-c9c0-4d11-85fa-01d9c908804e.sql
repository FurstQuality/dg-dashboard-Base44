
ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS elevation_ft integer,
  ADD COLUMN IF NOT EXISTS shot_shape text,
  ADD COLUMN IF NOT EXISTS hazards text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS designer_notes text;

CREATE TABLE IF NOT EXISTS public.hole_tees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id uuid NOT NULL REFERENCES public.holes(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  distance_ft integer,
  latitude double precision,
  longitude double precision,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hole_tees TO authenticated;
GRANT ALL ON public.hole_tees TO service_role;

ALTER TABLE public.hole_tees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read hole tees"
  ON public.hole_tees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Course owner can manage hole tees"
  ON public.hole_tees FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.holes h
      JOIN public.course_layouts cl ON cl.id = h.layout_id
      JOIN public.courses c ON c.id = cl.course_id
      WHERE h.id = hole_tees.hole_id
        AND c.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.holes h
      JOIN public.course_layouts cl ON cl.id = h.layout_id
      JOIN public.courses c ON c.id = cl.course_id
      WHERE h.id = hole_tees.hole_id
        AND c.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS hole_tees_hole_id_idx ON public.hole_tees(hole_id);

DROP TRIGGER IF EXISTS trg_hole_tees_updated_at ON public.hole_tees;
CREATE TRIGGER trg_hole_tees_updated_at
  BEFORE UPDATE ON public.hole_tees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
