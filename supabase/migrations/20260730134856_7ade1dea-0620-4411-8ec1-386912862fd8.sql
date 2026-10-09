ALTER TABLE public.course_sources DROP CONSTRAINT IF EXISTS course_sources_source_check;
ALTER TABLE public.course_sources ADD CONSTRAINT course_sources_source_check CHECK (source = ANY (ARRAY['pdga'::text,'dgs'::text,'udisc'::text,'dgcr'::text]));

CREATE TABLE public.dgcr_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dgcr_id text NOT NULL UNIQUE,
  slug text,
  name text NOT NULL,
  park_name text,
  city text,
  state text,
  country text DEFAULT 'USA',
  postal_code text,
  latitude double precision,
  longitude double precision,
  rating numeric,
  review_count integer,
  hole_count integer,
  basket_count integer,
  water_holes integer,
  length_min_ft integer,
  length_max_ft integer,
  terrain text,
  foliage text,
  designer text,
  year_established integer,
  tee_type text,
  basket_type text,
  conditions text,
  pars integer[] NOT NULL DEFAULT '{}',
  sse numeric[] NOT NULL DEFAULT '{}',
  rounds_recorded integer,
  avg_score numeric,
  description text,
  directions text,
  url text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dgcr_courses_course_idx ON public.dgcr_courses(course_id);
CREATE INDEX dgcr_courses_state_idx ON public.dgcr_courses(state);
CREATE INDEX dgcr_courses_name_idx ON public.dgcr_courses(lower(name));

GRANT SELECT, INSERT, UPDATE ON public.dgcr_courses TO authenticated;
GRANT ALL ON public.dgcr_courses TO service_role;

ALTER TABLE public.dgcr_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dgcr_courses_read_authenticated" ON public.dgcr_courses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "dgcr_courses_insert_authenticated" ON public.dgcr_courses
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "dgcr_courses_update_authenticated" ON public.dgcr_courses
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_dgcr_courses_updated_at BEFORE UPDATE ON public.dgcr_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();