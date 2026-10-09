REVOKE ALL ON FUNCTION public.run_lost_disc_matching(uuid, uuid, uuid, text, text, integer, text, integer, uuid, double precision, double precision, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.record_marketplace_price() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_match_marketplace_listing() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_match_found_report() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_lost_disc_reunited() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.score_lost_disc_match(text, text, integer, text, integer, uuid, double precision, double precision, date, public.lost_disc_reports) FROM anon, authenticated;