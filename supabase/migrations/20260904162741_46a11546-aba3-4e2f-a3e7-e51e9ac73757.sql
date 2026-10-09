ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'share';

CREATE OR REPLACE FUNCTION public.repost_post(_post_id uuid, _body text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_id uuid;
  _visible boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to share posts';
  END IF;

  -- Only shareable if the caller can actually see the original post.
  SELECT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = _post_id) INTO _visible;
  IF NOT _visible THEN
    RAISE EXCEPTION 'That post is no longer available';
  END IF;

  INSERT INTO public.posts (author_id, type, body, repost_of)
  VALUES (_uid, 'text', NULLIF(btrim(coalesce(_body, '')), ''), _post_id)
  RETURNING id INTO _new_id;

  UPDATE public.posts
     SET share_count = coalesce(share_count, 0) + 1
   WHERE id = _post_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.repost_post(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repost_post(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repost_post(uuid, text) TO service_role;