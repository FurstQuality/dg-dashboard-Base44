CREATE OR REPLACE FUNCTION public.course_place_index()
RETURNS TABLE (city text, state text, lat double precision, lng double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (lower(c.city), upper(coalesce(c.state, '')))
         c.city,
         c.state,
         c.latitude::double precision AS lat,
         c.longitude::double precision AS lng
  FROM public.courses c
  WHERE c.city IS NOT NULL
    AND c.latitude IS NOT NULL
    AND c.longitude IS NOT NULL
  ORDER BY lower(c.city), upper(coalesce(c.state, '')), c.id
$$;

REVOKE ALL ON FUNCTION public.course_place_index() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_place_index() TO authenticated;
GRANT EXECUTE ON FUNCTION public.course_place_index() TO service_role;