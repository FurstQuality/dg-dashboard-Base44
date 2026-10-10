CREATE TABLE public.course_match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_a uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  course_b uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name_score numeric NOT NULL,
  distance_m numeric NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','same','different')),
  decided_by uuid,
  decided_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (course_a < course_b),
  UNIQUE (course_a, course_b)
);
GRANT SELECT, UPDATE ON public.course_match_candidates TO authenticated;
GRANT ALL ON public.course_match_candidates TO service_role;
ALTER TABLE public.course_match_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read match candidates" ON public.course_match_candidates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Admins decide match candidates" ON public.course_match_candidates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX course_match_candidates_status_idx ON public.course_match_candidates(status, confidence);

-- Names that point at separate courses in one park (North/South, Red/Blue, numbers) never count as high confidence.
CREATE OR REPLACE FUNCTION public.course_name_variant_tokens(_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT m[1] ORDER BY m[1]), '{}')
  FROM regexp_matches(lower(coalesce(_name,'')),
    '\m(north|south|east|west|upper|lower|red|blue|white|gold|black|green|long|short|front|back|championship|pro|am|beginner|kids|ii|iii|[0-9]+)\M','g') m
$$;

CREATE OR REPLACE FUNCTION public.refresh_course_match_candidates()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only admins can refresh course matches';
  END IF;
  WITH c AS (
    SELECT id, name, latitude lat, longitude lng, public.course_match_key(name) k,
           public.course_name_variant_tokens(name) v,
           floor(latitude/0.01)::int gy, floor(longitude/0.01)::int gx
    FROM courses WHERE is_ghost = false AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND coalesce(location_quality::text,'') NOT IN ('city_approximate','unknown')
  ), pairs AS (
    SELECT a.id ia, b.id ib, a.k ka, b.k kb, a.v va, b.v vb,
      extensions.similarity(a.k, b.k) sim,
      6371000 * 2 * asin(sqrt(power(sin(radians(b.lat-a.lat)/2),2) + cos(radians(a.lat))*cos(radians(b.lat))*power(sin(radians(b.lng-a.lng)/2),2))) dist
    FROM c a JOIN c b ON b.gy BETWEEN a.gy-1 AND a.gy+1 AND b.gx BETWEEN a.gx-1 AND a.gx+1 AND a.id < b.id
  ), scored AS (
    SELECT *, CASE
      WHEN va <> vb AND (cardinality(va) > 0 OR cardinality(vb) > 0) THEN CASE WHEN sim >= 0.4 AND dist < 500 THEN 'low' END
      WHEN ka = kb AND ka <> '' AND dist < 400 THEN 'high'
      WHEN sim >= 0.6 AND dist < 600 THEN 'medium'
      WHEN sim >= 0.4 AND dist < 300 THEN 'low'
    END conf
    FROM pairs WHERE length(ka) > 2 AND length(kb) > 2
  )
  INSERT INTO course_match_candidates(course_a, course_b, name_score, distance_m, confidence, reasons)
  SELECT ia, ib, round(sim::numeric,2), round(dist::numeric), conf,
    jsonb_build_array(
      CASE WHEN ka = kb THEN 'Same name' ELSE 'Similar name ('||round(sim*100)||'%)' END,
      round(dist)||' m apart')
    || CASE WHEN va <> vb AND (cardinality(va)>0 OR cardinality(vb)>0)
         THEN jsonb_build_array('Names suggest separate courses in one park') ELSE '[]'::jsonb END
  FROM scored WHERE conf IS NOT NULL
  ON CONFLICT (course_a, course_b) DO UPDATE
    SET name_score = EXCLUDED.name_score, distance_m = EXCLUDED.distance_m,
        confidence = EXCLUDED.confidence, reasons = EXCLUDED.reasons
    WHERE course_match_candidates.status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.refresh_course_match_candidates() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_course_match_candidates() TO authenticated, service_role;

-- Backfill PDGA source links for PDGA-imported courses that never got one.
INSERT INTO public.course_sources(course_id, source, external_id, canonical_url, matched_name, confidence)
SELECT c.id, 'pdga', c.pdga_course_id::text, c.pdga_url, c.name, 100
FROM public.courses c
WHERE c.source = 'pdga' AND c.is_ghost = false AND c.pdga_course_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.course_sources s WHERE s.course_id = c.id AND s.source = 'pdga')
  AND NOT EXISTS (SELECT 1 FROM public.course_sources s WHERE s.source = 'pdga' AND s.external_id = c.pdga_course_id::text)
ON CONFLICT DO NOTHING;

SELECT public.refresh_course_match_candidates();