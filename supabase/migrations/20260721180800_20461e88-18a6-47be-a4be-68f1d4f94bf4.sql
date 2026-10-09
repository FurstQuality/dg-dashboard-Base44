
-- Enums
CREATE TYPE public.course_feature_type AS ENUM (
  'bench','gazebo','tree','water','fence','path',
  'ob_line','ob_area','mando','dropzone',
  'restroom','trash','parking','tee_sign','note'
);

CREATE TYPE public.ob_side AS ENUM ('left','right','none');

-- Table
CREATE TABLE public.course_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  layout_id UUID REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  hole_number SMALLINT,
  type public.course_feature_type NOT NULL,
  -- geometry stored as JSON: { "points": [[lat,lng], ...] }
  -- 1 point = pin, 2+ points = line, 3+ closed = polygon (for ob_area)
  geometry JSONB NOT NULL,
  ob_side public.ob_side NOT NULL DEFAULT 'none',
  label TEXT,
  notes TEXT,
  color TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_features_course ON public.course_features(course_id);
CREATE INDEX idx_course_features_layout_hole ON public.course_features(layout_id, hole_number);

GRANT SELECT ON public.course_features TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_features TO authenticated;
GRANT ALL ON public.course_features TO service_role;

ALTER TABLE public.course_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Features are public"
  ON public.course_features FOR SELECT USING (true);

CREATE POLICY "Course owner inserts features"
  ON public.course_features FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid())
  );

CREATE POLICY "Course owner updates features"
  ON public.course_features FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid()));

CREATE POLICY "Course owner deletes features"
  ON public.course_features FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid()));

CREATE TRIGGER course_features_touch
  BEFORE UPDATE ON public.course_features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-hole caddy notes (tee-sign / caddy-book copy authored by the TD)
ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS caddy_notes TEXT;
