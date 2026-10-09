REVOKE ALL ON FUNCTION public.trg_notify_saved_searches() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_watchers() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_match_marketplace_listing() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_match_found_report() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_lost_disc_reunited() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.record_marketplace_price() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.run_lost_disc_matching(uuid, uuid, uuid, text, text, integer, text, text, uuid, double precision, double precision, date) FROM anon, authenticated;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'score_lost_disc_match'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;