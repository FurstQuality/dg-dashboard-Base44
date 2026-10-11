ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS par_source text;
COMMENT ON COLUMN public.holes.par_source IS 'Where par came from: udisc_listing, disc_golf_scene_listing, steward, or null (default par 3, not confirmed).';
CREATE INDEX IF NOT EXISTS course_sources_fetch_idx ON public.course_sources (source, last_fetched_at NULLS FIRST);