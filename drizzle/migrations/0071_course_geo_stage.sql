-- Temporary staging for the one-off town-location backfill; dropped after use.
CREATE TABLE IF NOT EXISTS public.zz_course_geo_stage (id uuid, lat float8, lng float8, src text);
REVOKE ALL ON public.zz_course_geo_stage FROM anon, authenticated;
ALTER TABLE public.zz_course_geo_stage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    GRANT INSERT, SELECT ON public.zz_course_geo_stage TO sandbox_exec;
    CREATE POLICY "sandbox staging" ON public.zz_course_geo_stage FOR ALL TO sandbox_exec USING (true) WITH CHECK (true);
  END IF;
END $$;