CREATE OR REPLACE FUNCTION public.guard_friend_request_spam()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  pending_count integer;
  recent_count integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO pending_count
    FROM public.friendships f
   WHERE f.requester_id = NEW.requester_id
     AND f.status = 'pending';

  IF pending_count >= 100 THEN
    RAISE EXCEPTION 'You have too many friend requests waiting for a reply. Wait for some to be answered before sending more.';
  END IF;

  SELECT count(*) INTO recent_count
    FROM public.friendships f
   WHERE f.requester_id = NEW.requester_id
     AND f.created_at > now() - interval '1 hour';

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'You have sent a lot of friend requests in the past hour. Try again a little later.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_spam_guard ON public.friendships;
CREATE TRIGGER friendships_spam_guard
  BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.guard_friend_request_spam();

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.guest_scorers FROM anon;