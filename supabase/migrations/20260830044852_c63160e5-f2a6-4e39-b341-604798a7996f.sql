CREATE OR REPLACE FUNCTION public.enforce_course_moderation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server credentials (no JWT) and super admins may change anything.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- A course creator may edit their own course content, but may not approve it
  -- themselves, hand it to someone else, or flip verification flags.
  NEW.moderation_status := OLD.moderation_status;
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_course_moderation_guard_trg ON public.courses;
CREATE TRIGGER enforce_course_moderation_guard_trg
BEFORE UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.enforce_course_moderation_guard();

REVOKE ALL ON FUNCTION public.enforce_course_moderation_guard() FROM PUBLIC, anon, authenticated;