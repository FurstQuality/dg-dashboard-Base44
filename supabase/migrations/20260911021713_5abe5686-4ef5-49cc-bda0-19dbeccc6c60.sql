-- 1) Chat membership: no more free self-join into any conversation.
CREATE OR REPLACE FUNCTION public.may_join_conversation(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- The room you just created, before anyone is in it.
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conv
      AND c.created_by = _user
      AND NOT EXISTS (
        SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = _conv
      )
  ) OR EXISTS (
    -- Event or club rooms: membership follows the event/club roster.
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conv
      AND c.event_kind IS NOT NULL
      AND c.event_id IS NOT NULL
      AND public.can_access_event_chat(c.event_kind, c.event_id, _user)
  ) OR EXISTS (
    -- A live invite link for this room.
    SELECT 1 FROM public.conversation_invites i
    WHERE i.conversation_id = _conv
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  );
$$;

REVOKE ALL ON FUNCTION public.may_join_conversation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_join_conversation(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS conv_members_insert ON public.conversation_members;
CREATE POLICY conv_members_insert ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- The room's creator sets up the roster.
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid()
    )
    -- An existing member can add someone to a group room.
    OR (
      public.is_conversation_member(conversation_members.conversation_id, auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_members.conversation_id AND c.is_group
      )
    )
    -- Or you are joining yourself, and you are entitled to.
    OR (
      user_id = auth.uid()
      AND public.may_join_conversation(conversation_members.conversation_id, auth.uid())
    )
  );

-- 2) Lost & Found: keep reporter phone numbers out of ordinary reads.
REVOKE SELECT ON public.lost_disc_reports FROM authenticated;
GRANT SELECT (
  id, user_id, kind, mold_name, brand, color, weight_grams, ink_name,
  ink_pdga_number, course_id, hole_number, latitude, longitude, city, state,
  occurred_on, reward, handoff_notes, photo_url, status, reunited_at,
  created_at, updated_at
) ON public.lost_disc_reports TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lost_disc_reports TO authenticated;
GRANT ALL ON public.lost_disc_reports TO service_role;