-- ============ Enrich existing tables (additive, all nullable) ============
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS pdga_course_id text,
  ADD COLUMN IF NOT EXISTS pdga_url text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS hole_count_verified boolean,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enrichment_source text;

CREATE UNIQUE INDEX IF NOT EXISTS courses_pdga_course_id_uidx
  ON public.courses (pdga_course_id) WHERE pdga_course_id IS NOT NULL;

ALTER TABLE public.pdga_players
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS member_since integer,
  ADD COLUMN IF NOT EXISTS class text,
  ADD COLUMN IF NOT EXISTS official_status text,
  ADD COLUMN IF NOT EXISTS career_wins integer,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

ALTER TABLE public.pdga_events
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS distance_from_seed_km numeric,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

ALTER TABLE public.pdga_tour_events
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS distance_from_seed_km numeric,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

-- ============ PDGA KB: courses ============
CREATE TABLE IF NOT EXISTS public.pdga_kb_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_course_id text UNIQUE,
  name text NOT NULL,
  city text,
  state text,
  country text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  hole_count integer,
  designer text,
  year_established integer,
  pdga_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pdga_kb_courses TO service_role;
ALTER TABLE public.pdga_kb_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_courses super admin only"
  ON public.pdga_kb_courses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdga_kb_courses TO authenticated;

CREATE INDEX IF NOT EXISTS pdga_kb_courses_name_idx ON public.pdga_kb_courses (lower(name));
CREATE INDEX IF NOT EXISTS pdga_kb_courses_state_idx ON public.pdga_kb_courses (state);

-- ============ PDGA KB: players ============
CREATE TABLE IF NOT EXISTS public.pdga_kb_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number integer UNIQUE NOT NULL,
  name text NOT NULL,
  rating integer,
  class text,
  city text,
  state text,
  country text,
  member_since integer,
  official_status text,
  career_wins integer,
  pdga_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pdga_kb_players TO service_role;
ALTER TABLE public.pdga_kb_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_players super admin only"
  ON public.pdga_kb_players FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdga_kb_players TO authenticated;

CREATE INDEX IF NOT EXISTS pdga_kb_players_state_idx ON public.pdga_kb_players (state);
CREATE INDEX IF NOT EXISTS pdga_kb_players_name_idx ON public.pdga_kb_players (lower(name));

-- ============ PDGA KB: events ============
CREATE TABLE IF NOT EXISTS public.pdga_kb_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_event_id text UNIQUE NOT NULL,
  name text NOT NULL,
  tier text,
  start_date date,
  end_date date,
  host_club text,
  city text,
  state text,
  country text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  distance_from_seed_km numeric,
  course_refs text[],
  pdga_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pdga_kb_events TO service_role;
ALTER TABLE public.pdga_kb_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_events super admin only"
  ON public.pdga_kb_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdga_kb_events TO authenticated;

CREATE INDEX IF NOT EXISTS pdga_kb_events_state_idx ON public.pdga_kb_events (state);
CREATE INDEX IF NOT EXISTS pdga_kb_events_start_idx ON public.pdga_kb_events (start_date);

-- ============ PDGA KB: sync jobs ============
CREATE TABLE IF NOT EXISTS public.pdga_kb_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,           -- 'course' | 'player' | 'event' | 'directory'
  target text NOT NULL,         -- pdga id or url
  status text NOT NULL DEFAULT 'pending',  -- pending | running | success | failed | skipped
  http_status integer,
  error text,
  result jsonb,
  attempts integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pdga_kb_sync_jobs TO service_role;
ALTER TABLE public.pdga_kb_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_jobs super admin only"
  ON public.pdga_kb_sync_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdga_kb_sync_jobs TO authenticated;

CREATE INDEX IF NOT EXISTS pdga_kb_jobs_next_run_idx
  ON public.pdga_kb_sync_jobs (next_run_at) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS pdga_kb_jobs_kind_target_idx
  ON public.pdga_kb_sync_jobs (kind, target);

-- ============ PDGA KB: seed regions ============
CREATE TABLE IF NOT EXISTS public.pdga_kb_seed_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  postal_code text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_km numeric NOT NULL DEFAULT 80,
  active boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pdga_kb_seed_regions TO service_role;
ALTER TABLE public.pdga_kb_seed_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_regions super admin only"
  ON public.pdga_kb_seed_regions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdga_kb_seed_regions TO authenticated;

-- updated_at triggers
CREATE TRIGGER trg_pdga_kb_courses_updated BEFORE UPDATE ON public.pdga_kb_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pdga_kb_players_updated BEFORE UPDATE ON public.pdga_kb_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pdga_kb_events_updated BEFORE UPDATE ON public.pdga_kb_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pdga_kb_jobs_updated BEFORE UPDATE ON public.pdga_kb_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pdga_kb_regions_updated BEFORE UPDATE ON public.pdga_kb_seed_regions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed anchor: Valparaiso, IN (ZIP 46383), 80 km / ~50 mi
INSERT INTO public.pdga_kb_seed_regions (label, postal_code, latitude, longitude, radius_km, active)
VALUES ('Valparaiso IN (50mi)', '46383', 41.4731, -87.0611, 80, true)
ON CONFLICT DO NOTHING;

-- ============ KB stats helper (super admin) ============
CREATE OR REPLACE FUNCTION public.pdga_kb_stats()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'super_admin') THEN
    jsonb_build_object(
      'courses', (SELECT count(*) FROM public.pdga_kb_courses),
      'players', (SELECT count(*) FROM public.pdga_kb_players),
      'events',  (SELECT count(*) FROM public.pdga_kb_events),
      'pending', (SELECT count(*) FROM public.pdga_kb_sync_jobs WHERE status='pending'),
      'failed',  (SELECT count(*) FROM public.pdga_kb_sync_jobs WHERE status='failed'),
      'last_success', (SELECT max(finished_at) FROM public.pdga_kb_sync_jobs WHERE status='success')
    )
  ELSE NULL END;
$$;
GRANT EXECUTE ON FUNCTION public.pdga_kb_stats() TO authenticated;