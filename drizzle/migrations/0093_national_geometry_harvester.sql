
CREATE TABLE public.course_geometry_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('openstreetmap','udisc','disc_golf_scene','pdga','dgd_native','gps','file_import','steward')),
  source_external_id text NOT NULL,
  source_site_id text,
  feature_type text NOT NULL CHECK (feature_type IN ('course_point','course_boundary','physical_hole','tee','basket_position','practice_basket','maybe_tee','maybe_basket')),
  hole_ref int CHECK (hole_ref BETWEEN 1 AND 99),
  hole_ref_inferred boolean NOT NULL DEFAULT false,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('verified','high','medium','low')),
  match_state text NOT NULL DEFAULT 'unmatched' CHECK (match_state IN ('unmatched','matched','needs_review','accepted','rejected','conflict','superseded','source_removed')),
  applied_hole_id uuid,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  source_version text,
  UNIQUE (source, source_external_id)
);
CREATE INDEX cgo_course_idx ON public.course_geometry_observations (course_id, match_state);
CREATE INDEX cgo_state_idx ON public.course_geometry_observations (match_state);
CREATE INDEX cgo_latlng_idx ON public.course_geometry_observations (latitude, longitude);
GRANT SELECT ON public.course_geometry_observations TO authenticated;
GRANT ALL ON public.course_geometry_observations TO service_role;
ALTER TABLE public.course_geometry_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read geometry observations" ON public.course_geometry_observations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
COMMENT ON TABLE public.course_geometry_observations IS 'Source-observed tee/basket coordinates. Never canonical until accepted; writes only via server (service role).';

CREATE TABLE public.geometry_harvest_cells (
  id text PRIMARY KEY,
  region text NOT NULL,
  south double precision NOT NULL,
  west double precision NOT NULL,
  north double precision NOT NULL,
  east double precision NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  attempts int NOT NULL DEFAULT 0,
  sites_found int NOT NULL DEFAULT 0,
  observations int NOT NULL DEFAULT 0,
  courses_matched int NOT NULL DEFAULT 0,
  holes_filled int NOT NULL DEFAULT 0,
  last_error text,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ghc_next_idx ON public.geometry_harvest_cells (status, next_run_at);
GRANT SELECT ON public.geometry_harvest_cells TO authenticated;
GRANT ALL ON public.geometry_harvest_cells TO service_role;
ALTER TABLE public.geometry_harvest_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read harvest cells" ON public.geometry_harvest_cells FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- National 1-degree grid: lower 48, Alaska, Hawaii.
INSERT INTO public.geometry_harvest_cells (id, region, south, west, north, east)
SELECT format('%s:%s:%s', r.region, la, lo), r.region, la, lo, la + 1, lo + 1
FROM (VALUES ('us48', 24, 49, -125, -67), ('ak', 51, 71, -170, -130), ('hi', 18, 22, -161, -155)) AS r(region, s, n, w, e)
CROSS JOIN LATERAL generate_series(r.s, r.n) AS la
CROSS JOIN LATERAL generate_series(r.w, r.e) AS lo
ON CONFLICT DO NOTHING;
