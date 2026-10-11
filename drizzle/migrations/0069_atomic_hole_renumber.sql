-- One statement moves a layout's holes into a temporary negative range that
-- keeps each hole's number recoverable (-1000000 - n). Runs as the caller, so
-- the existing holes RLS still decides who can do it.
CREATE OR REPLACE FUNCTION public.begin_layout_hole_renumber(_layout uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.holes SET number = -1000000 - abs(number) % 1000
  WHERE layout_id = _layout AND number > 0;
$$;
GRANT EXECUTE ON FUNCTION public.begin_layout_hole_renumber(uuid) TO authenticated;

-- Repair the Rogers Lakewood Park "Main" layout, whose adjacent holes were
-- swapped by an interrupted save. Order follows the played labels.
WITH wanted(label, pos) AS (
  SELECT l, ord FROM unnest(ARRAY['1','2','3','4','5','6','7','8','X','Y','Z',
    '9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24'])
    WITH ORDINALITY AS t(l, ord)
), rows AS (
  SELECT h.id, w.pos FROM public.holes h
  JOIN wanted w ON w.label = coalesce(nullif(trim(h.nickname), ''), h.number::text)
  WHERE h.layout_id = 'b5b97235-5af2-4e99-9c2d-f0f4406c5fcd'
)
UPDATE public.holes h SET number = -5000000 - r.pos FROM rows r WHERE h.id = r.id
  AND (SELECT count(*) FROM rows) = 27;
UPDATE public.holes SET number = -5000000 - number
  WHERE layout_id = 'b5b97235-5af2-4e99-9c2d-f0f4406c5fcd' AND number < -5000000;