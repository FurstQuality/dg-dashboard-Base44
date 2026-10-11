ALTER TABLE public.course_holes ADD COLUMN IF NOT EXISTS hole_number integer, ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.course_tees ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual', ADD COLUMN IF NOT EXISTS source_observation_id uuid REFERENCES public.course_geometry_observations(id) ON DELETE SET NULL;
ALTER TABLE public.course_baskets ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual', ADD COLUMN IF NOT EXISTS source_observation_id uuid REFERENCES public.course_geometry_observations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS course_tees_source_obs_uq ON public.course_tees(source_observation_id) WHERE source_observation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS course_baskets_source_obs_uq ON public.course_baskets(source_observation_id) WHERE source_observation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS course_holes_course_number_idx ON public.course_holes(course_id, hole_number);