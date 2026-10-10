ALTER TABLE public.tracker_event_rounds ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tracker_event_rounds_course_idx ON public.tracker_event_rounds(course_id);

-- Links a published course name to exactly one directory course; ambiguous names stay unlinked.
CREATE OR REPLACE FUNCTION public.tracker_round_resolve_course(_name text, _state text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n text; ids uuid[];
BEGIN
  IF _name IS NULL OR btrim(_name) = '' THEN RETURN NULL; END IF;
  n := lower(btrim(_name));
  SELECT array_agg(id) INTO ids FROM public.courses
   WHERE moderation_status = 'approved' AND NOT coalesce(is_ghost,false)
     AND lower(name) IN (n, n || ' disc golf course', regexp_replace(n, '\s+disc golf course$', ''));
  IF ids IS NULL THEN RETURN NULL; END IF;
  IF array_length(ids,1) = 1 THEN RETURN ids[1]; END IF;
  IF _state IS NOT NULL THEN
    SELECT array_agg(id) INTO ids FROM public.courses WHERE id = ANY(ids) AND state = _state;
    IF array_length(ids,1) = 1 THEN RETURN ids[1]; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tracker_round_resolve_course(text, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.tracker_round_link_course()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.course_name IS NOT DISTINCT FROM OLD.course_name AND NEW.course_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.course_id := public.tracker_round_resolve_course(
    NEW.course_name, (SELECT state FROM public.tracker_group_events WHERE id = NEW.event_id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tracker_round_link_course_trg ON public.tracker_event_rounds;
CREATE TRIGGER tracker_round_link_course_trg BEFORE INSERT OR UPDATE OF course_name, event_id
  ON public.tracker_event_rounds FOR EACH ROW EXECUTE FUNCTION public.tracker_round_link_course();

UPDATE public.tracker_event_rounds r SET course_id = public.tracker_round_resolve_course(
  r.course_name, (SELECT state FROM public.tracker_group_events e WHERE e.id = r.event_id))
WHERE r.course_id IS NULL;