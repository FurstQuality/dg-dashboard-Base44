
CREATE OR REPLACE FUNCTION public.guard_course_report_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- direct client writes (not via SECURITY DEFINER RPCs) cannot set trust/lifecycle fields
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.lifecycle := 'REPORTED'; NEW.confidence := 'UNVERIFIED'; NEW.freshness_state := 'FRESH';
      NEW.confirm_count := 0; NEW.resolved_count := 0; NEW.dispute_count := 0;
      NEW.archived_at := NULL; NEW.resolved_at := NULL;
      IF NEW.priority NOT IN ('INFO','LOW','MEDIUM','HIGH','SAFETY') THEN NEW.priority := 'MEDIUM'; END IF;
    ELSE
      NEW.lifecycle := OLD.lifecycle; NEW.confidence := OLD.confidence; NEW.freshness_state := OLD.freshness_state;
      NEW.confirm_count := OLD.confirm_count; NEW.resolved_count := OLD.resolved_count; NEW.dispute_count := OLD.dispute_count;
      NEW.archived_at := OLD.archived_at; NEW.resolved_at := OLD.resolved_at; NEW.status := OLD.status;
      NEW.priority := OLD.priority; NEW.reporter_id := OLD.reporter_id; NEW.course_id := OLD.course_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_course_report_fields BEFORE INSERT OR UPDATE ON public.course_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_course_report_fields();
