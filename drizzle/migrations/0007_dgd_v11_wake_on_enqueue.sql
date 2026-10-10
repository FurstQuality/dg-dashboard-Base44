CREATE OR REPLACE FUNCTION public.dgd_v11_wake_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE t text; u text;
BEGIN
  SELECT token INTO t FROM public.dgd_v11_worker_secret WHERE id = 1;
  FOREACH u IN ARRAY ARRAY[
    'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5-dev.lovable.app/api/public/dgd-v11-worker',
    'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5.lovable.app/api/public/dgd-v11-worker'] LOOP
    PERFORM net.http_post(url := u,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-dgd-worker-token', t),
      body := '{}'::jsonb, timeout_milliseconds := 55000);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dgd worker wake failed: %', SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public.dgd_v11_wake_worker() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v11_wake_worker() TO service_role;

-- Wake the worker only when a new job is opened (merged events don't re-wake).
CREATE OR REPLACE FUNCTION public.dgd_v11_enqueue(_user uuid, _reason text, _from date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_new boolean;
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
    updated_at = now()
  RETURNING (xmax = 0) INTO is_new;
  INSERT INTO public.dgd_v11_freshness (user_id, latest_source_change_at, recalculation_pending)
  VALUES (_user, now(), true)
  ON CONFLICT (user_id) DO UPDATE SET latest_source_change_at = now(), recalculation_pending = true, updated_at = now();
  IF is_new THEN PERFORM public.dgd_v11_wake_worker(); END IF;
END $$;
REVOKE ALL ON FUNCTION public.dgd_v11_enqueue(uuid, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v11_enqueue(uuid, text, date) TO service_role;