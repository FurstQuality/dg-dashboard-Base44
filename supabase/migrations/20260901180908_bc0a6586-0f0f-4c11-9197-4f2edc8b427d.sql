-- 1. Fix broken block check on friendship inserts
DROP POLICY IF EXISTS "Send friend request" ON public.friendships;
CREATE POLICY "Send friend request"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND status = 'pending'
    AND addressee_id <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = friendships.addressee_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'blocked'
        AND (
          (f.requester_id = friendships.addressee_id AND f.addressee_id = auth.uid())
          OR (f.addressee_id = friendships.addressee_id AND f.requester_id = auth.uid())
        )
    )
  );

-- 2. Duel rosters require self-insert or a pending invite for an accepted friend
DROP POLICY IF EXISTS "Duel creators can add participants" ON public.duel_participants;
CREATE POLICY "Duel creators can add participants"
  ON public.duel_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_duels d
      WHERE d.id = duel_participants.duel_id AND d.created_by = auth.uid()
    )
    AND (
      user_id = auth.uid()
      OR (
        public.are_friends(auth.uid(), user_id)
        AND coalesce(invite_status, 'invited') = 'invited'
      )
    )
  );

-- 3. Hide ink_phone from broad reads; expose it only to authorized parties
REVOKE SELECT ON public.lost_disc_reports FROM authenticated;
REVOKE SELECT ON public.lost_disc_reports FROM anon;
GRANT SELECT (id, user_id, kind, mold_name, brand, color, weight_grams, ink_name,
  ink_pdga_number, course_id, hole_number, latitude, longitude, city, state,
  occurred_on, reward, handoff_notes, photo_url, status, reunited_at, created_at,
  updated_at) ON public.lost_disc_reports TO authenticated;

CREATE OR REPLACE FUNCTION public.get_lost_disc_contact(_report_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.ink_phone
  FROM public.lost_disc_reports r
  WHERE r.id = _report_id
    AND (
      r.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.lost_disc_claims c
        WHERE c.report_id = r.id
          AND c.claimant_id = auth.uid()
          AND c.state = 'confirmed'::lost_disc_claim_state
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_lost_disc_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lost_disc_contact(uuid) TO authenticated, service_role;