REVOKE EXECUTE ON FUNCTION public.tracker_pdga_sync_finish(text, boolean, jsonb, text, int, text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_pdga_sync_finish(text, boolean, jsonb, text, int, text, int) TO service_role;
CREATE OR REPLACE FUNCTION public.tracker_pdga_sync_finish(
  _tourn_id text, _ok boolean, _payload jsonb, _fingerprint text, _interval_seconds int, _error text, _retry_after_seconds int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; wait int;
BEGIN
  -- Only the server (service role) records results, so no follower can plant a shared snapshot.
  IF _ok THEN
    UPDATE public.tracker_pdga_sync_state SET status='completed', attempt_count=0, error=NULL,
      payload=_payload, fingerprint=_fingerprint, last_success_at=now(),
      next_check_at = now() + make_interval(secs => greatest(30, least(coalesce(_interval_seconds,600), 86400))),
      claimed_at=NULL, updated_at=now()
     WHERE tourn_id=_tourn_id;
  ELSE
    SELECT attempt_count + 1 INTO n FROM public.tracker_pdga_sync_state WHERE tourn_id=_tourn_id;
    wait := greatest(coalesce(_retry_after_seconds,0), least(3600, 60 * (2 ^ least(coalesce(n,1),6))::int)) + floor(random()*30)::int;
    UPDATE public.tracker_pdga_sync_state SET status = CASE WHEN n >= 6 THEN 'failed' ELSE 'retry' END,
      attempt_count=n, error=left(_error,300), next_check_at=now() + make_interval(secs => wait),
      claimed_at=NULL, updated_at=now()
     WHERE tourn_id=_tourn_id;
  END IF;
END $$;