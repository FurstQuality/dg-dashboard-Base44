CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid,
  _type public.notification_type,
  _post_id uuid DEFAULT NULL,
  _comment_id uuid DEFAULT NULL,
  _club_id uuid DEFAULT NULL,
  _data jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _id uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _user_id IS NULL OR _user_id = _actor THEN
    RETURN NULL;
  END IF;
  IF _type NOT IN ('like','comment','mention','share','follow','friend_request','friend_accept','event') THEN
    RAISE EXCEPTION 'Notification type % is not allowed here', _type;
  END IF;

  INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id, club_id, data)
  VALUES (_user_id, _actor, _type, _post_id, _comment_id, _club_id, _data)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, public.notification_type, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, public.notification_type, uuid, uuid, uuid, jsonb) TO authenticated;