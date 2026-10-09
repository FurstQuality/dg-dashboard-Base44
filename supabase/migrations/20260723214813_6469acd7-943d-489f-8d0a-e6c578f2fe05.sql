
REVOKE EXECUTE ON FUNCTION public.get_league_td_contact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tournament_td_contact(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_league_td_contact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tournament_td_contact(uuid) TO service_role;
