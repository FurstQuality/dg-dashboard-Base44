CREATE OR REPLACE FUNCTION public.resolve_post_report(
  _report_id uuid,
  _hide boolean,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _rep record;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT (public.has_role(_actor, 'admin') OR public.has_role(_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT * INTO _rep FROM public.post_reports WHERE id = _report_id;
  IF _rep IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;

  IF _hide THEN
    UPDATE public.posts SET hidden_at = now() WHERE id = _rep.post_id AND hidden_at IS NULL;
  END IF;

  UPDATE public.post_reports
     SET status = 'resolved',
         resolved_by = _actor,
         resolved_at = now(),
         resolution = CASE WHEN _hide THEN 'hidden' ELSE 'kept' END,
         reviewer_note = nullif(btrim(coalesce(_note, '')), '')
   WHERE id = _report_id;

  INSERT INTO public.notifications (user_id, actor_id, type, post_id, data)
  VALUES (
    _rep.reporter_id,
    _actor,
    'report_resolved',
    _rep.post_id,
    jsonb_build_object(
      'resolution', CASE WHEN _hide THEN 'hidden' ELSE 'kept' END,
      'note', nullif(btrim(coalesce(_note, '')), '')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_post_report(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_post_report(uuid, boolean, text) TO authenticated;
