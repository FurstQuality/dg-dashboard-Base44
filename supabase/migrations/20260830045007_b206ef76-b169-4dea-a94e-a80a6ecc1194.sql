CREATE OR REPLACE FUNCTION public.enforce_course_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  -- Service/maintenance credentials have no end-user JWT; treat them as trusted.
  is_privileged := auth.uid() IS NULL OR public.has_role(auth.uid(), 'super_admin');

  IF TG_OP = 'INSERT' THEN
    IF NOT is_privileged THEN
      NEW.moderation_status := 'pending';
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.submitted_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT is_privileged THEN
      NEW.moderation_status := OLD.moderation_status;
      NEW.rejection_reason := OLD.rejection_reason;
      NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at;
      NEW.created_by := OLD.created_by;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_course_moderation_guard_trg ON public.courses;
DROP FUNCTION IF EXISTS public.enforce_course_moderation_guard();

REVOKE ALL ON FUNCTION public.enforce_course_moderation() FROM PUBLIC, anon, authenticated;