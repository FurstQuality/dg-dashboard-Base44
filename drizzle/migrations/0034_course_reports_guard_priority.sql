
CREATE OR REPLACE FUNCTION public.guard_course_report_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.lifecycle := 'REPORTED'; NEW.confidence := 'UNVERIFIED'; NEW.freshness_state := 'FRESH';
      NEW.confirm_count := 0; NEW.resolved_count := 0; NEW.dispute_count := 0;
      NEW.archived_at := NULL; NEW.resolved_at := NULL;
      NEW.priority := CASE
        WHEN NEW.category = 'SAFETY' THEN 'SAFETY'
        WHEN NEW.priority IN ('INFO','LOW','MEDIUM','HIGH') AND NEW.priority <> 'MEDIUM' THEN NEW.priority
        WHEN NEW.severity = 'minor' THEN 'LOW'
        WHEN NEW.severity = 'blocking' THEN 'HIGH'
        ELSE 'MEDIUM' END;
    ELSE
      NEW.lifecycle := OLD.lifecycle; NEW.confidence := OLD.confidence; NEW.freshness_state := OLD.freshness_state;
      NEW.confirm_count := OLD.confirm_count; NEW.resolved_count := OLD.resolved_count; NEW.dispute_count := OLD.dispute_count;
      NEW.archived_at := OLD.archived_at; NEW.resolved_at := OLD.resolved_at; NEW.status := OLD.status;
      NEW.priority := OLD.priority; NEW.reporter_id := OLD.reporter_id; NEW.course_id := OLD.course_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
