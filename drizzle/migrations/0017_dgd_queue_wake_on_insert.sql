-- Any new rating job (enqueue function, admin backfill, manual insert) wakes the worker once per statement.
CREATE OR REPLACE FUNCTION public.dgd_v11_jobs_wake_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM new_rows WHERE status IN ('queued','retry_pending') AND run_after <= now()) THEN
    PERFORM public.dgd_v11_wake_worker();
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.dgd_v11_jobs_wake_on_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dgd_v11_jobs_wake ON public.dgd_v11_jobs;
CREATE TRIGGER dgd_v11_jobs_wake AFTER INSERT ON public.dgd_v11_jobs
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.dgd_v11_jobs_wake_on_insert();

-- Enqueue no longer wakes directly; the insert trigger does it (one wake path, no double calls).
CREATE OR REPLACE FUNCTION public.dgd_v11_enqueue(_user uuid, _reason text, _from date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  INSERT INTO public.dgd_v11_jobs (user_id, reasons, earliest_affected_on)
  VALUES (_user, ARRAY[_reason], _from)
  ON CONFLICT (user_id, model_version) WHERE status IN ('queued','retry_pending')
  DO UPDATE SET
    reasons = ARRAY(SELECT DISTINCT x FROM unnest(public.dgd_v11_jobs.reasons || EXCLUDED.reasons) x),
    earliest_affected_on = CASE
      WHEN public.dgd_v11_jobs.earliest_affected_on IS NULL OR EXCLUDED.earliest_affected_on IS NULL THEN NULL
      ELSE LEAST(public.dgd_v11_jobs.earliest_affected_on, EXCLUDED.earliest_affected_on) END,
    updated_at = now();
  INSERT INTO public.dgd_v11_freshness (user_id, latest_source_change_at, recalculation_pending)
  VALUES (_user, now(), true)
  ON CONFLICT (user_id) DO UPDATE SET latest_source_change_at = now(), recalculation_pending = true, updated_at = now();
END $function$;