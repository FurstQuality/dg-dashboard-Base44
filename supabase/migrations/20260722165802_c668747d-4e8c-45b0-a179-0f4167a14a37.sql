
-- 1. Extend clubs with social/source metadata
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS clubs_external_source_id_key
  ON public.clubs (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- 2. Weather cache columns
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS weather jsonb;

ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS weather jsonb;

-- 3. OpenStreetMap places cache (courses + clubs discovered via Overpass)
CREATE TABLE IF NOT EXISTS public.osm_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_type text NOT NULL,
  osm_id bigint NOT NULL,
  kind text NOT NULL,
  name text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  address text,
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  imported_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (osm_type, osm_id)
);

GRANT SELECT ON public.osm_places TO authenticated;
GRANT SELECT ON public.osm_places TO anon;
GRANT ALL ON public.osm_places TO service_role;

ALTER TABLE public.osm_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "OSM places are readable by anyone"
  ON public.osm_places FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS osm_places_geo_idx
  ON public.osm_places (latitude, longitude);
CREATE INDEX IF NOT EXISTS osm_places_kind_idx
  ON public.osm_places (kind);

-- 4. Data ingest jobs (audit of scrape/import runs)
CREATE TABLE IF NOT EXISTS public.data_ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  source_url text,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_ingest_jobs TO authenticated;
GRANT ALL ON public.data_ingest_jobs TO service_role;

ALTER TABLE public.data_ingest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ingest jobs"
  ON public.data_ingest_jobs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS data_ingest_jobs_user_idx
  ON public.data_ingest_jobs (user_id, created_at DESC);
