ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS event_kind text,
  ADD COLUMN IF NOT EXISTS event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_event
  ON public.conversations(event_kind, event_id)
  WHERE event_kind IS NOT NULL AND event_id IS NOT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_event_organizer(_kind text, _event uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _kind
    WHEN 'tournament' THEN EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = _event AND t.owner_id = _user)
    WHEN 'league' THEN EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = _event AND l.owner_id = _user)
    WHEN 'community' THEN EXISTS (SELECT 1 FROM public.community_events e WHERE e.id = _event AND e.host_id = _user)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_event_chat(_kind text, _event uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_event_organizer(_kind, _event, _user) OR CASE _kind
    WHEN 'tournament' THEN EXISTS (
      SELECT 1 FROM public.tournament_registrations r
      WHERE r.tournament_id = _event AND r.user_id = _user
    )
    WHEN 'league' THEN EXISTS (
      SELECT 1 FROM public.league_registrations r
      WHERE r.league_id = _event AND r.user_id = _user
    )
    WHEN 'community' THEN EXISTS (
      SELECT 1 FROM public.event_rsvps r
      WHERE r.event_id = _event AND r.user_id = _user
    )
    ELSE false
  END;
$$;

-- Join (or create) the chat room for an event the caller belongs to.
CREATE OR REPLACE FUNCTION public.dgim_join_event_chat(_kind text, _event uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv uuid;
  _title text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF _kind NOT IN ('tournament', 'league', 'community') THEN
    RAISE EXCEPTION 'Unsupported event type';
  END IF;
  IF NOT public.can_access_event_chat(_kind, _event, auth.uid()) THEN
    RAISE EXCEPTION 'You are not part of this event';
  END IF;

  SELECT id INTO _conv FROM public.conversations
   WHERE event_kind = _kind AND event_id = _event LIMIT 1;

  IF _conv IS NULL THEN
    _title := CASE _kind
      WHEN 'tournament' THEN (SELECT name FROM public.tournaments WHERE id = _event)
      WHEN 'league' THEN (SELECT name FROM public.leagues WHERE id = _event)
      ELSE (SELECT title FROM public.community_events WHERE id = _event)
    END;
    INSERT INTO public.conversations (is_group, kind, title, topic, event_kind, event_id, created_by)
    VALUES (true, 'event', COALESCE(_title, 'Event chat'), 'Event updates and player chat', _kind, _event, auth.uid())
    RETURNING id INTO _conv;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (_conv, auth.uid())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN _conv;
END;
$$;

-- Only the event organizer may flag a message as an official announcement.
CREATE OR REPLACE FUNCTION public.enforce_announcement_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind text;
  _event uuid;
BEGIN
  IF NEW.is_announcement IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  SELECT event_kind, event_id INTO _kind, _event
    FROM public.conversations WHERE id = NEW.conversation_id;
  IF _kind IS NULL OR NOT public.is_event_organizer(_kind, _event, NEW.sender_id) THEN
    NEW.is_announcement := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_announcement ON public.messages;
CREATE TRIGGER trg_messages_announcement
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_announcement_author();

REVOKE ALL ON FUNCTION public.is_event_organizer(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_event_chat(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dgim_join_event_chat(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_announcement_author() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_organizer(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_event_chat(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dgim_join_event_chat(text, uuid) TO authenticated;