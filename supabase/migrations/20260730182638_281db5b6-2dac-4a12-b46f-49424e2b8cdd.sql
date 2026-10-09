CREATE OR REPLACE FUNCTION public.course_match_key(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(coalesce(_name, '')),
               '(disc golf park|disc golf course|disc golf complex|disc golf|dgc|^the )', '', 'g'),
             '[^a-z0-9]', '', 'g'),
           'park$', '');
$$;

CREATE INDEX IF NOT EXISTS courses_match_key_idx
  ON public.courses (public.course_match_key(name));

CREATE OR REPLACE FUNCTION public.find_duplicate_courses(
  _name text,
  _city text DEFAULT NULL,
  _state text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _exclude_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, city text, state text, slug text, hole_count integer, layout_count integer, match_reason text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.city, c.state, c.slug, c.hole_count,
         (SELECT count(*)::int FROM public.course_layouts cl WHERE cl.course_id = c.id),
         CASE
           WHEN _city IS NOT NULL AND lower(coalesce(c.city,'')) = lower(_city)
             THEN 'same_name_same_city'
           ELSE 'same_name_nearby'
         END
    FROM public.courses c
   WHERE auth.uid() IS NOT NULL
     AND coalesce(c.is_ghost, false) = false
     AND (_exclude_id IS NULL OR c.id <> _exclude_id)
     AND length(public.course_match_key(_name)) > 3
     AND public.course_match_key(c.name) = public.course_match_key(_name)
     AND (
       (_city IS NOT NULL AND lower(coalesce(c.city,'')) = lower(_city)
         AND lower(coalesce(c.state,'')) = lower(coalesce(_state,'')))
       OR (_lat IS NOT NULL AND _lng IS NOT NULL AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
         AND abs(c.latitude - _lat) < 0.004 AND abs(c.longitude - _lng) < 0.004)
     )
   ORDER BY 7 DESC, c.name
   LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_courses(text, text, text, double precision, double precision, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_duplicate_courses(text, text, text, double precision, double precision, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_courses(text, text, text, double precision, double precision, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_courses()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing record;
  key text;
BEGIN
  IF coalesce(NEW.is_ghost, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND public.course_match_key(NEW.name) = public.course_match_key(OLD.name)
     AND coalesce(lower(NEW.city),'') = coalesce(lower(OLD.city),'')
     AND coalesce(lower(NEW.state),'') = coalesce(lower(OLD.state),'') THEN
    RETURN NEW;
  END IF;

  key := public.course_match_key(NEW.name);
  IF length(key) <= 3 THEN
    RETURN NEW;
  END IF;

  SELECT c.id, c.name, c.city, c.state INTO existing
    FROM public.courses c
   WHERE c.id <> NEW.id
     AND coalesce(c.is_ghost, false) = false
     AND public.course_match_key(c.name) = key
     AND (
       (NEW.city IS NOT NULL AND lower(coalesce(c.city,'')) = lower(NEW.city)
         AND lower(coalesce(c.state,'')) = lower(coalesce(NEW.state,'')))
       OR (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
         AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
         AND abs(c.latitude - NEW.latitude) < 0.004
         AND abs(c.longitude - NEW.longitude) < 0.004)
     )
   LIMIT 1;

  IF existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'This course already exists as "%"%. Add a layout to that course instead of creating a duplicate.',
      existing.name,
      CASE WHEN existing.city IS NOT NULL THEN ' in ' || existing.city || coalesce(', ' || existing.state, '') ELSE '' END
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_courses_trg ON public.courses;
CREATE TRIGGER prevent_duplicate_courses_trg
  BEFORE INSERT OR UPDATE OF name, city, state, latitude, longitude ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_courses();