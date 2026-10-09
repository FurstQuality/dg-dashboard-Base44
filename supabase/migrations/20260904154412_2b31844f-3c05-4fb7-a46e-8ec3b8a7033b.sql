CREATE OR REPLACE FUNCTION public.can_access_event_chat(_kind text, _event uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHEN 'club' THEN EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _event AND m.user_id = _user
    ) OR EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = _event AND c.owner_id = _user
    )
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.dgim_join_event_chat(_kind text, _event uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _conv uuid;
  _title text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  IF _kind NOT IN ('tournament', 'league', 'community', 'club') THEN
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
      WHEN 'club' THEN (SELECT name || ' chat' FROM public.clubs WHERE id = _event)
      ELSE (SELECT title FROM public.community_events WHERE id = _event)
    END;
    INSERT INTO public.conversations (is_group, kind, title, topic, event_kind, event_id, created_by)
    VALUES (
      true,
      CASE WHEN _kind = 'club' THEN 'club' ELSE 'event' END,
      COALESCE(_title, 'Event chat'),
      CASE WHEN _kind = 'club' THEN 'Club news and member chat' ELSE 'Event updates and player chat' END,
      _kind,
      _event,
      auth.uid()
    )
    RETURNING id INTO _conv;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (_conv, auth.uid())
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN _conv;
END;
$function$;