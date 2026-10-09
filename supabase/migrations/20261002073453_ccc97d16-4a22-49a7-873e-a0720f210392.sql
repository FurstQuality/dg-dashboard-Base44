CREATE OR REPLACE FUNCTION public.canonicalize_pending_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u uuid; n int := 0;
BEGIN
  FOR u IN
    SELECT DISTINCT e.user_id FROM external_rounds e
     WHERE NOT EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.source_table='external_rounds' AND s.source_row_id = e.id)
    UNION
    SELECT DISTINCT rr.user_id FROM round_ratings rr JOIN rounds r ON r.id = rr.round_id
     WHERE rr.user_id IS NOT NULL AND r.status = 'completed'
       AND NOT EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.source_table='round_ratings' AND s.source_row_id = rr.id)
  LOOP
    PERFORM public.canonicalize_user_rounds(u);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.canonicalize_pending_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_pending_users() TO service_role;

-- New imports: sort once per import batch, never failing the import itself.
CREATE OR REPLACE FUNCTION public.canonicalize_after_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM new_rows WHERE user_id IS NOT NULL LOOP
    BEGIN
      PERFORM public.canonicalize_user_rounds(u);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'canonicalize failed for %: %', u, SQLERRM;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.canonicalize_after_import() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER external_rounds_canonicalize AFTER INSERT ON public.external_rounds
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.canonicalize_after_import();

-- In-app rounds: sort when a round is marked completed.
CREATE OR REPLACE FUNCTION public.canonicalize_after_round_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE u uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    FOR u IN SELECT DISTINCT user_id FROM round_ratings WHERE round_id = NEW.id AND user_id IS NOT NULL LOOP
      BEGIN
        PERFORM public.canonicalize_user_rounds(u);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'canonicalize failed for %: %', u, SQLERRM;
      END;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.canonicalize_after_round_complete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rounds_canonicalize_on_complete AFTER UPDATE OF status ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.canonicalize_after_round_complete();

-- Deleted source rows: drop the link, and the canonical round once nothing backs it.
CREATE OR REPLACE FUNCTION public.unlink_deleted_source_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_round uuid;
BEGIN
  DELETE FROM canonical_round_sources WHERE source_table = TG_TABLE_NAME AND source_row_id = OLD.id
  RETURNING canonical_round_id INTO v_round;
  IF v_round IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM canonical_round_sources WHERE canonical_round_id = v_round) THEN
      DELETE FROM canonical_rounds WHERE id = v_round;
    ELSE
      UPDATE canonical_rounds SET source_count = GREATEST(1, source_count - 1), updated_at = now() WHERE id = v_round;
    END IF;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.unlink_deleted_source_round() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER external_rounds_unlink_canonical AFTER DELETE ON public.external_rounds
  FOR EACH ROW EXECUTE FUNCTION public.unlink_deleted_source_round();
CREATE TRIGGER round_ratings_unlink_canonical AFTER DELETE ON public.round_ratings
  FOR EACH ROW EXECUTE FUNCTION public.unlink_deleted_source_round();

-- Low-frequency reconciliation backstop.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('canonicalize-rounds-daily', '15 4 * * *', $$SELECT public.canonicalize_pending_users()$$);