-- 1) Enforce who may change a friendship status, and which transitions are legal.
CREATE OR REPLACE FUNCTION public.guard_friendship_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Only the addressee can accept a waiting request.
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    IF _actor IS NOT NULL AND _actor <> OLD.addressee_id THEN
      RAISE EXCEPTION 'Only the player who received the request can accept it.';
    END IF;
  END IF;

  -- An answered friendship cannot be pushed back to waiting.
  IF OLD.status <> 'pending' AND NEW.status = 'pending' THEN
    RAISE EXCEPTION 'That friendship has already been answered.';
  END IF;

  -- Requester and addressee are fixed for the life of the row.
  IF NEW.requester_id <> OLD.requester_id OR NEW.addressee_id <> OLD.addressee_id THEN
    RAISE EXCEPTION 'A friend request cannot be reassigned to different players.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_friendship_transition ON public.friendships;
CREATE TRIGGER trg_guard_friendship_transition
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.guard_friendship_transition();

-- 2) Always notify, no matter which part of the app writes the row.
CREATE OR REPLACE FUNCTION public.on_friendship_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
       WHERE n.user_id = NEW.addressee_id
         AND n.actor_id = NEW.requester_id
         AND n.type = 'friend_request'
         AND n.read_at IS NULL
    ) THEN
      INSERT INTO public.notifications (user_id, actor_id, type)
      VALUES (NEW.addressee_id, NEW.requester_id, 'friend_request');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted' THEN
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.requester_id, NEW.addressee_id, 'friend_accept');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.on_friendship_notify() FROM anon;
REVOKE ALL ON FUNCTION public.guard_friendship_transition() FROM anon;

DROP TRIGGER IF EXISTS trg_friendship_notify_insert ON public.friendships;
CREATE TRIGGER trg_friendship_notify_insert
  AFTER INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.on_friendship_notify();

DROP TRIGGER IF EXISTS trg_friendship_notify_update ON public.friendships;
CREATE TRIGGER trg_friendship_notify_update
  AFTER UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.on_friendship_notify();