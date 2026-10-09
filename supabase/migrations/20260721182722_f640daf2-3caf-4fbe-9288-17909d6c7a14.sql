
CREATE TABLE public.hole_baskets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id uuid NOT NULL REFERENCES public.holes(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  distance_ft integer,
  latitude double precision,
  longitude double precision,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hole_baskets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hole_baskets TO authenticated;
GRANT ALL ON public.hole_baskets TO service_role;

ALTER TABLE public.hole_baskets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read hole baskets"
  ON public.hole_baskets FOR SELECT
  USING (true);

CREATE POLICY "Course owner can manage hole baskets"
  ON public.hole_baskets FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.holes h
    JOIN public.course_layouts cl ON cl.id = h.layout_id
    JOIN public.courses c ON c.id = cl.course_id
    WHERE h.id = hole_baskets.hole_id AND c.created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.holes h
    JOIN public.course_layouts cl ON cl.id = h.layout_id
    JOIN public.courses c ON c.id = cl.course_id
    WHERE h.id = hole_baskets.hole_id AND c.created_by = auth.uid()
  ));

CREATE INDEX idx_hole_baskets_hole_id ON public.hole_baskets(hole_id);

-- Rename existing tee/basket columns' primary label support: add name column to primary tee/basket per hole
ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS tee_name text,
  ADD COLUMN IF NOT EXISTS basket_name text,
  ADD COLUMN IF NOT EXISTS tee_color text,
  ADD COLUMN IF NOT EXISTS basket_color text;
