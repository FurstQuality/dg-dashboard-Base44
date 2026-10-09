CREATE OR REPLACE FUNCTION public.is_club_member(_club_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = _club_id AND cm.user_id = _user
  );
$$;

REVOKE ALL ON FUNCTION public.is_club_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members or owner view club members" ON public.club_members;

CREATE POLICY "Members or owner view club members"
ON public.club_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_club_member(club_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_members.club_id AND c.owner_id = auth.uid())
);