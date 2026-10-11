CREATE OR REPLACE FUNCTION public.course_map_coverage_rows(_course_ids uuid[] DEFAULT NULL)
RETURNS TABLE(course_id uuid, expected_holes integer, mapped_holes integer, map_state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT id, hole_count FROM courses
    WHERE moderation_status = 'approved' AND is_ghost = false AND merged_into_course_id IS NULL
      AND (_course_ids IS NULL OR id = ANY(_course_ids))
  ),
  phys AS (
    SELECT h.course_id, count(*)::int AS n FROM course_holes h
    WHERE EXISTS (SELECT 1 FROM course_tees t WHERE t.course_hole_id = h.id AND t.latitude IS NOT NULL)
      AND EXISTS (SELECT 1 FROM course_baskets b WHERE b.course_hole_id = h.id AND b.latitude IS NOT NULL)
      AND h.course_id IN (SELECT id FROM c)
    GROUP BY h.course_id
  ),
  legacy AS (
    SELECT l.course_id, max(x.n)::int AS n FROM course_layouts l
    JOIN LATERAL (SELECT count(*) AS n FROM holes ho WHERE ho.layout_id = l.id AND ho.tee_lat IS NOT NULL AND ho.basket_lat IS NOT NULL) x ON true
    WHERE l.status <> 'draft' AND l.course_id IN (SELECT id FROM c)
    GROUP BY l.course_id
  ),
  exp AS (
    SELECT l.course_id, max(l.hole_count)::int AS n FROM course_layouts l WHERE l.status <> 'draft' AND l.course_id IN (SELECT id FROM c) GROUP BY l.course_id
  )
  SELECT c.id,
    COALESCE(c.hole_count, exp.n) AS expected_holes,
    GREATEST(COALESCE(phys.n,0), COALESCE(legacy.n,0)) AS mapped_holes,
    CASE
      WHEN GREATEST(COALESCE(phys.n,0), COALESCE(legacy.n,0)) = 0 THEN 'unmapped'
      WHEN COALESCE(c.hole_count, exp.n) IS NOT NULL AND GREATEST(COALESCE(phys.n,0), COALESCE(legacy.n,0)) >= COALESCE(c.hole_count, exp.n)
        AND EXISTS (SELECT 1 FROM course_stewards s WHERE s.course_id = c.id) THEN 'verified'
      WHEN GREATEST(COALESCE(phys.n,0), COALESCE(legacy.n,0)) >= GREATEST(3, CEIL(COALESCE(c.hole_count, exp.n, 6) * 0.5)) THEN 'starter'
      ELSE 'partial'
    END
  FROM c LEFT JOIN phys ON phys.course_id = c.id LEFT JOIN legacy ON legacy.course_id = c.id LEFT JOIN exp ON exp.course_id = c.id;
$$;
REVOKE ALL ON FUNCTION public.course_map_coverage_rows(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.course_map_coverage_rows(uuid[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.course_map_coverage_by_state()
RETURNS TABLE(state text, courses bigint, unmapped bigint, partial bigint, starter bigint, verified bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(co.state, '—'), count(*), count(*) FILTER (WHERE r.map_state='unmapped'), count(*) FILTER (WHERE r.map_state='partial'),
    count(*) FILTER (WHERE r.map_state='starter'), count(*) FILTER (WHERE r.map_state='verified')
  FROM public.course_map_coverage_rows(NULL) r JOIN courses co ON co.id = r.course_id
  GROUP BY 1 ORDER BY 2 DESC;
$$;
REVOKE ALL ON FUNCTION public.course_map_coverage_by_state() FROM public;
GRANT EXECUTE ON FUNCTION public.course_map_coverage_by_state() TO authenticated, service_role;