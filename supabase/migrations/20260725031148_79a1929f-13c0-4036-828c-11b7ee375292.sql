
-- club_members: drop the public policy; keep the authenticated-only one
DROP POLICY IF EXISTS club_members_read ON public.club_members;

-- Restrict td_email / td_phone columns on leagues and tournaments.
-- Revoke column privileges from anon and authenticated; owners read via
-- security-definer functions get_league_td_contact / get_tournament_td_contact.
REVOKE SELECT (td_email, td_phone) ON public.leagues FROM anon, authenticated;
REVOKE SELECT (td_email, td_phone) ON public.tournaments FROM anon, authenticated;
