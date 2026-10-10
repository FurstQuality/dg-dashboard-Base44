CREATE TABLE public.course_tee_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  color text NOT NULL DEFAULT '#ffffff' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  display_order int NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, name)
);
CREATE INDEX course_tee_sets_course_idx ON public.course_tee_sets(course_id);
GRANT SELECT ON public.course_tee_sets TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.course_tee_sets TO authenticated;
GRANT ALL ON public.course_tee_sets TO service_role;
ALTER TABLE public.course_tee_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in players read tee sets" ON public.course_tee_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Stewards manage tee sets" ON public.course_tee_sets FOR ALL TO authenticated
  USING (public.can_steward_course(course_id, auth.uid()))
  WITH CHECK (public.can_steward_course(course_id, auth.uid()));

ALTER TABLE public.hole_tees
  ADD COLUMN route_mode text NOT NULL DEFAULT 'same' CHECK (route_mode IN ('same','joins','own')),
  ADD COLUMN flight_path jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.hole_tees.route_mode IS 'same = shares the main fairway; joins = own throw that meets the main fairway; own = separate shot to the basket';