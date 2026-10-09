
CREATE OR REPLACE VIEW public.course_stats
WITH (security_invoker = true) AS
SELECT
  c.id AS course_id,
  COALESCE(r.avg_rating, 0)::numeric(3,2) AS avg_rating,
  COALESCE(r.review_count, 0)::int AS review_count,
  COALESCE(p.play_count, 0)::int AS play_count
FROM public.courses c
LEFT JOIN (
  SELECT course_id,
         AVG(rating)::numeric(3,2) AS avg_rating,
         COUNT(*)::int AS review_count
  FROM public.course_reviews
  GROUP BY course_id
) r ON r.course_id = c.id
LEFT JOIN (
  SELECT course_id, COUNT(*)::int AS play_count
  FROM public.rounds
  WHERE course_id IS NOT NULL
  GROUP BY course_id
) p ON p.course_id = c.id;

GRANT SELECT ON public.course_stats TO authenticated, anon;
