
WITH hole_courses AS (
  SELECT h.id AS hole_id,
         cl.course_id,
         h.basket_lat AS lat,
         h.basket_lng AS lng
  FROM public.holes h
  JOIN public.course_layouts cl ON cl.id = h.layout_id
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
