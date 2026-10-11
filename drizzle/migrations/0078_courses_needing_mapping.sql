CREATE OR REPLACE FUNCTION public.courses_needing_mapping(_state text DEFAULT NULL, _search text DEFAULT NULL, _limit int DEFAULT 50, _offset int DEFAULT 0)
RETURNS TABLE(id uuid, name text, city text, state text, hole_count int, mapped_holes int, location_quality text, total_count bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH m AS (
    SELECT l.course_id, count(*) FILTER (WHERE h.tee_lat IS NOT NULL AND h.basket_lat IS NOT NULL)::int AS mapped
    FROM course_layouts l JOIN holes h ON h.layout_id = l.id AND h.number > 0
    WHERE l.is_default
    GROUP BY l.course_id
  ), base AS (
    SELECT c.id, c.name, c.city, c.state, coalesce(c.hole_count, 0)::int AS hole_count,
           coalesce(m.mapped, 0) AS mapped_holes, c.location_quality::text AS location_quality
    FROM courses c LEFT JOIN m ON m.course_id = c.id
    WHERE coalesce(c.is_ghost, false) = false
      AND coalesce(c.moderation_status::text, 'approved') <> 'rejected'
      AND (_state IS NULL OR c.state = _state)
      AND (_search IS NULL OR c.name ILIKE '%' || _search || '%' OR c.city ILIKE '%' || _search || '%')
      AND (coalesce(c.hole_count, 0) = 0 OR coalesce(m.mapped, 0) < c.hole_count)
  )
  SELECT b.*, count(*) OVER () FROM base b
  ORDER BY (b.mapped_holes > 0) DESC,
           CASE WHEN b.hole_count > 0 THEN b.mapped_holes::float / b.hole_count ELSE 0 END DESC,
           b.state NULLS LAST, b.name
  LIMIT least(greatest(_limit, 1), 100) OFFSET greatest(_offset, 0);
$$;
GRANT EXECUTE ON FUNCTION public.courses_needing_mapping(text, text, int, int) TO authenticated;