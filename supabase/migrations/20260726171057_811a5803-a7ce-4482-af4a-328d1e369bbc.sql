CREATE TABLE IF NOT EXISTS public.pdga_dgs_links (
  event_ref text PRIMARY KEY,
  dgs_event_url text,
  dgs_event_slug text,
  dgs_course_url text,
  dgs_course_id text,
  dgs_course_slug text,
  dgs_course_name text,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pdga_dgs_links TO anon, authenticated;
GRANT ALL ON public.pdga_dgs_links TO service_role;

ALTER TABLE public.pdga_dgs_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdga_dgs_links readable to everyone"
  ON public.pdga_dgs_links FOR SELECT
  USING (true);

ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS dgs_event_url text,
  ADD COLUMN IF NOT EXISTS dgs_course_url text,
  ADD COLUMN IF NOT EXISTS dgs_course_id text;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS dgs_event_url text,
  ADD COLUMN IF NOT EXISTS dgs_course_url text,
  ADD COLUMN IF NOT EXISTS dgs_course_id text;
