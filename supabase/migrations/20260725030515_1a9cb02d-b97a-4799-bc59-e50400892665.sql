-- Restrict club_members and user_achievements SELECT to authenticated users.
DROP POLICY IF EXISTS "Club members are viewable by everyone" ON public.club_members;
DROP POLICY IF EXISTS "Club members public read" ON public.club_members;
DROP POLICY IF EXISTS "Anyone can view club members" ON public.club_members;
DROP POLICY IF EXISTS "Public can view club members" ON public.club_members;

CREATE POLICY "Authenticated users can view club members"
  ON public.club_members FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.club_members FROM anon;

DROP POLICY IF EXISTS "User achievements are viewable by everyone" ON public.user_achievements;
DROP POLICY IF EXISTS "Anyone can view user achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Public can view achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "User achievements public read" ON public.user_achievements;

CREATE POLICY "Authenticated users can view user achievements"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.user_achievements FROM anon;