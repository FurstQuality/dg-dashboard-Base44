
ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS physical_hole_key uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS holes_physical_hole_key_idx
  ON public.holes(physical_hole_key);

CREATE INDEX IF NOT EXISTS holes_layout_physical_idx
  ON public.holes(layout_id, physical_hole_key);

WITH hole_courses AS (
  SELECT h.id AS hole_id,
         cl.course_id,
         hb.latitude AS lat,
         hb.longitude AS lng
  FROM public.holes h
  JOIN public.course_layouts cl ON cl.id = h.layout_id
  LEFT JOIN LATERAL (
    SELECT latitude, longitude
    FROM public.hole_baskets
    WHERE hole_id = h.id
    ORDER BY created_at ASC
    LIMIT 1
  ) hb ON true
),
groups AS (
  SELECT hole_id,
         CASE
           WHEN lat IS NULL OR lng IS NULL THEN NULL
           ELSE format('%s|%s|%s',
                       course_id::text,
                       round(lat::numeric, 5)::text,
                       round(lng::numeric, 5)::text)
         END AS grp
  FROM hole_courses
),
group_keys AS (
  SELECT grp, gen_random_uuid() AS shared_key
  FROM (SELECT DISTINCT grp FROM groups WHERE grp IS NOT NULL) g
)
UPDATE public.holes h
SET physical_hole_key = gk.shared_key
FROM groups g
JOIN group_keys gk ON gk.grp = g.grp
WHERE h.id = g.hole_id
  AND g.grp IS NOT NULL;
