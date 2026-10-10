CREATE TABLE public.course_sign_terrain (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  bbox double precision[] NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'openstreetmap',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.course_sign_terrain IS 'Cached OpenStreetMap ground detail (woods, water, paths, buildings) drawn on tee signs. Display only; written by the server.';
GRANT SELECT ON public.course_sign_terrain TO authenticated;
GRANT ALL ON public.course_sign_terrain TO service_role;
ALTER TABLE public.course_sign_terrain ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in players can read sign terrain" ON public.course_sign_terrain FOR SELECT TO authenticated USING (true);