CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a))
      OR EXISTS (SELECT 1 FROM public.friendships WHERE status = 'blocked'
                 AND ((requester_id = _a AND addressee_id = _b) OR (requester_id = _b AND addressee_id = _a)));
$$;

-- Returns NULL when the caller may contact _target, otherwise a short reason.
-- _kind: 'message' or 'friend_request'. Only the caller's own access is answered.
CREATE OR REPLACE FUNCTION public.contact_block_reason(_target uuid, _kind text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); prefs jsonb; mode text;
BEGIN
  IF me IS NULL THEN RETURN 'Sign in first.'; END IF;
  IF _target IS NULL OR _target = me THEN RETURN NULL; END IF;
  IF public.is_blocked_between(me, _target) THEN RETURN 'You can''t contact this player.'; END IF;
  SELECT privacy_prefs INTO prefs FROM public.profiles WHERE id = _target;
  IF _kind = 'friend_request' THEN
    IF coalesce((prefs->>'allowFriendRequests')::boolean, true) = false THEN
      RETURN 'This player isn''t taking friend requests.';
    END IF;
  ELSE
    mode := coalesce(prefs->>'allowMessagesFrom', 'everyone');
    IF mode = 'nobody' THEN RETURN 'This player has turned off messages.'; END IF;
    IF mode = 'friends' AND NOT public.are_friends(me, _target) THEN
      RETURN 'This player only takes messages from friends.';
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.contact_block_reason(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contact_block_reason(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;

-- Direct messages: checked on every send against the other person's settings.
CREATE OR REPLACE FUNCTION public.enforce_message_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE conv record; other uuid; reason text;
BEGIN
  SELECT is_group, event_kind INTO conv FROM public.conversations WHERE id = NEW.conversation_id;
  IF conv.is_group OR conv.event_kind IS NOT NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO other FROM public.conversation_members
   WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id LIMIT 1;
  IF other IS NULL THEN RETURN NEW; END IF;
  reason := public.contact_block_reason(other, 'message');
  IF reason IS NOT NULL THEN RAISE EXCEPTION '%', reason USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_message_contact ON public.messages;
CREATE TRIGGER trg_enforce_message_contact BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_contact();

-- Adding someone else to a chat: blocks always apply; direct chats also respect message settings.
CREATE OR REPLACE FUNCTION public.enforce_member_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE conv record; reason text;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id = auth.uid() THEN RETURN NEW; END IF;
  SELECT is_group, event_kind INTO conv FROM public.conversations WHERE id = NEW.conversation_id;
  IF conv.event_kind IS NOT NULL THEN RETURN NEW; END IF;
  IF public.is_blocked_between(auth.uid(), NEW.user_id) THEN
    RAISE EXCEPTION 'You can''t add this player.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT conv.is_group THEN
    reason := public.contact_block_reason(NEW.user_id, 'message');
    IF reason IS NOT NULL THEN RAISE EXCEPTION '%', reason USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_member_contact ON public.conversation_members;
CREATE TRIGGER trg_enforce_member_contact BEFORE INSERT ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_contact();

-- Friend requests: blocks (either table) and the addressee's request setting.
CREATE OR REPLACE FUNCTION public.enforce_friend_request_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reason text;
BEGIN
  IF NEW.status <> 'pending' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  reason := public.contact_block_reason(NEW.addressee_id, 'friend_request');
  IF reason IS NOT NULL THEN RAISE EXCEPTION '%', reason USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_friend_request_contact ON public.friendships;
CREATE TRIGGER trg_enforce_friend_request_contact BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_friend_request_contact();