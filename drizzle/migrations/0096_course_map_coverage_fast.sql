CREATE INDEX IF NOT EXISTS course_tees_hole_idx ON public.course_tees(course_hole_id);
CREATE INDEX IF NOT EXISTS course_baskets_hole_idx ON public.course_baskets(course_hole_id);
CREATE INDEX IF NOT EXISTS holes_layout_mapped_idx ON public.holes(layout_id) WHERE tee_lat IS NOT NULL AND basket_lat IS NOT NULL;
CREATE OR REPLACE FUNCTION public.course_map_coverage_rows(_course_ids uuid[] DEFAULT NULL)
RETURNS TABLE(course_id uuid, expected_holes integer, mapped_holes integer, map_state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT id, hole_count FROM courses
    WHERE moderation_status = 'approved' AND is_ghost = false AND merged_into_course_id IS NULL
      AND (_course_ids IS NULL OR id = ANY(_course_ids))
  ),
  th AS (SELECT DISTINCT course_hole_id FROM course_tees WHERE latitude IS NOT NULL),
  bh AS (SELECT DISTINCT course_hole_id FROM course_baskets WHERE latitude IS NOT NULL),
  phys AS (
    SELECT h.course_id, count(*)::int AS n FROM course_holes h JOIN th ON th.course_hole_id = h.id JOIN bh ON bh.course_hole_id = h.id
    GROUP BY h.course_id
  ),
  lh AS (SELECT layout_id, count(*) AS n FROM holes WHERE tee_lat IS NOT NULL AND basket_lat IS NOT NULL GROUP BY layout_id),
  lay AS (
    SELECT l.course_id, max(COALESCE(lh.n,0))::int AS mapped, max(l.hole_count)::int AS expected
    FROM course_layouts l LEFT JOIN lh ON lh.layout_id = l.id WHERE l.status <> 'draft' GROUP BY l.course_id
  ),
  st AS (SELECT DISTINCT course_id FROM course_stewards),
  m AS (
    SELECT c.id, COALESCE(c.hole_count, lay.expected) AS e, GREATEST(COALESCE(phys.n,0), COALESCE(lay.mapped,0)) AS n, st.course_id IS NOT NULL AS stewarded
    FROM c LEFT JOIN phys ON phys.course_id = c.id LEFT JOIN lay ON lay.course_id = c.id LEFT JOIN st ON st.course_id = c.id
  )
  SELECT id, e, n,
    CASE WHEN n = 0 THEN 'unmapped'
         WHEN e IS NOT NULL AND n >= e AND stewarded THEN 'verified'
         WHEN n >= GREATEST(3, CEIL(COALESCE(e, 6) * 0.5)) THEN 'starter'
         ELSE 'partial' END
  FROM m;
$$;