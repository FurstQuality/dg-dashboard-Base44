CREATE TABLE IF NOT EXISTS public.geo_place_cache (
  place text PRIMARY KEY,
  latitude double precision,
  longitude double precision,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.geo_place_cache TO authenticated;
GRANT ALL ON public.geo_place_cache TO service_role;
ALTER TABLE public.geo_place_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in players can read cached places" ON public.geo_place_cache;
CREATE POLICY "Signed-in players can read cached places" ON public.geo_place_cache FOR SELECT TO authenticated USING (true);