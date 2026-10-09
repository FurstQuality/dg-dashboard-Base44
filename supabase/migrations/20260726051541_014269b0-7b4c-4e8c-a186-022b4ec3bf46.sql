
-- Fix 1: club_members SELECT policy — restrict to same-club members or club owner
DROP POLICY IF EXISTS "Authenticated users can view club members" ON public.club_members;

CREATE POLICY "Members or owner view club members"
ON public.club_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = club_members.club_id
      AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = club_members.club_id
      AND c.owner_id = auth.uid()
  )
);

-- Fix 2: tournament_scores SELECT — only expose when parent tournament is not draft,
-- or the caller is the registered player or the tournament owner.
DROP POLICY IF EXISTS "Anyone views scores" ON public.tournament_scores;

CREATE POLICY "Scores visible for published tournaments or stakeholders"
ON public.tournament_scores
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.tournament_rounds tr
    JOIN public.tournaments t ON t.id = tr.tournament_id
    WHERE tr.id = tournament_scores.round_id
      AND (
        t.status <> 'draft'::tournament_status
        OR t.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.tournament_registrations r
          WHERE r.id = tournament_scores.registration_id
            AND r.user_id = auth.uid()
        )
      )
  )
);
