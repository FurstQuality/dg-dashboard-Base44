CREATE OR REPLACE FUNCTION public.guard_registration_self_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  -- Server/admin work (no user) and event staff are trusted.
  IF _uid IS NULL OR public.is_event_director(NEW.tournament_id, _uid)
     OR public.can_manage_event('tournament', NEW.tournament_id, _uid) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'checked_in' OR NEW.checked_in_at IS NOT NULL OR NEW.checked_in_by IS NOT NULL THEN
      RAISE EXCEPTION 'Only event staff can check players in';
    END IF;
  ELSE
    IF (NEW.status = 'checked_in' AND OLD.status IS DISTINCT FROM 'checked_in')
       OR NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at
       OR NEW.checked_in_by IS DISTINCT FROM OLD.checked_in_by
       OR NEW.check_in_method IS DISTINCT FROM OLD.check_in_method THEN
      RAISE EXCEPTION 'Only event staff can check players in';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_registration_self_checkin ON public.tournament_registrations;
CREATE TRIGGER trg_guard_registration_self_checkin
BEFORE INSERT OR UPDATE ON public.tournament_registrations
FOR EACH ROW EXECUTE FUNCTION public.guard_registration_self_checkin();