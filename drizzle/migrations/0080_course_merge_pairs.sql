ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS merged_into_course_id uuid REFERENCES public.courses(id);
ALTER TABLE public.course_match_candidates ADD COLUMN IF NOT EXISTS kept_course_id uuid REFERENCES public.courses(id);

-- Soft merge: the duplicate is hidden and points at the kept course; its rounds,
-- layouts and history stay intact under its own id so nothing is lost and it can be undone.
CREATE OR REPLACE FUNCTION public.merge_course_pair(_candidate_id uuid, _keep_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.course_match_candidates; dup uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'Only admins can join courses';
  END IF;
  SELECT * INTO m FROM course_match_candidates WHERE id = _candidate_id FOR UPDATE;
  IF m.id IS NULL OR m.status <> 'pending' THEN RAISE EXCEPTION 'This pair was already decided'; END IF;
  IF _keep_id NOT IN (m.course_a, m.course_b) THEN RAISE EXCEPTION 'Pick one of the two courses to keep'; END IF;
  dup := CASE WHEN _keep_id = m.course_a THEN m.course_b ELSE m.course_a END;
  IF EXISTS (SELECT 1 FROM courses WHERE id = _keep_id AND merged_into_course_id IS NOT NULL) THEN
    RAISE EXCEPTION 'The course to keep was already joined into another one';
  END IF;

  -- Move outside listings the kept course doesn't have yet.
  UPDATE course_sources s SET course_id = _keep_id, updated_at = now()
  WHERE s.course_id = dup
    AND NOT EXISTS (SELECT 1 FROM course_sources k WHERE k.course_id = _keep_id AND k.source = s.source);

  UPDATE courses k SET
    pdga_course_id = coalesce(k.pdga_course_id, d.pdga_course_id),
    pdga_url = coalesce(k.pdga_url, d.pdga_url)
  FROM courses d WHERE k.id = _keep_id AND d.id = dup;

  UPDATE courses SET is_ghost = true, merged_into_course_id = _keep_id WHERE id = dup;
  UPDATE courses SET merged_into_course_id = _keep_id WHERE merged_into_course_id = dup;

  UPDATE course_match_candidates SET status = 'same', kept_course_id = _keep_id,
    decided_by = auth.uid(), decided_at = now() WHERE id = _candidate_id;
  -- Other pending pairs involving the hidden duplicate no longer need review.
  DELETE FROM course_match_candidates WHERE status = 'pending' AND dup IN (course_a, course_b);
  RETURN dup;
END $$;
REVOKE ALL ON FUNCTION public.merge_course_pair(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.merge_course_pair(uuid, uuid) TO authenticated;