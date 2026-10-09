CREATE OR REPLACE FUNCTION public.record_post_impressions(_post_ids uuid[], _new_viewer boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
  _count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _post_ids IS NULL OR array_length(_post_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(DISTINCT pid)
    INTO _ids
    FROM (
      SELECT pid FROM unnest(_post_ids) AS pid LIMIT 200
    ) s;

  INSERT INTO public.post_impressions (post_id, day, impressions, unique_viewers)
  SELECT p.id, CURRENT_DATE, 1, CASE WHEN _new_viewer THEN 1 ELSE 0 END
  FROM public.posts p
  WHERE p.id = ANY(_ids)
    AND p.author_id <> auth.uid()
  ON CONFLICT (post_id, day) DO UPDATE
    SET impressions = public.post_impressions.impressions + 1,
        unique_viewers = public.post_impressions.unique_viewers
          + CASE WHEN _new_viewer THEN 1 ELSE 0 END;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_post_impressions(uuid[], boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_post_impressions(uuid[], boolean) TO authenticated;