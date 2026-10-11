CREATE TABLE public.tracker_pdga_sync_state (
  tourn_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','processing','completed','retry','failed')),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  next_check_at timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  error text,
  fingerprint text,
  payload jsonb,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tracker_pdga_sync_state TO service_role;
ALTER TABLE public.tracker_pdga_sync_state ENABLE ROW LEVEL SECURITY;
-- No direct policies: followers reach it only through the functions below.

ALTER TABLE public.tracker_group_events ADD COLUMN IF NOT EXISTS live_fingerprint text;

-- Decide whether the caller should fetch PDGA now ('fetch') or reuse the shared
-- snapshot ('cached'/'busy'/'backoff'). One row per PDGA event serves every follower.
CREATE OR REPLACE FUNCTION public.tracker_pdga_sync_claim(_tourn_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tracker_pdga_sync_state;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _tourn_id !~ '^[0-9]{1,10}$' THEN RAISE EXCEPTION 'Bad event id'; END IF;
  INSERT INTO public.tracker_pdga_sync_state(tourn_id) VALUES (_tourn_id) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.tracker_pdga_sync_state WHERE tourn_id = _tourn_id FOR UPDATE;
  IF r.status = 'processing' AND r.claimed_at > now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('decision','busy','payload',r.payload,'fingerprint',r.fingerprint,'last_success_at',r.last_success_at);
  END IF;
  IF r.next_check_at IS NOT NULL AND r.next_check_at > now() THEN
    RETURN jsonb_build_object('decision', CASE WHEN r.status IN ('retry','failed') THEN 'backoff' ELSE 'cached' END,
      'payload',r.payload,'fingerprint',r.fingerprint,'last_success_at',r.last_success_at,
      'next_check_at',r.next_check_at,'error',r.error);
  END IF;
  UPDATE public.tracker_pdga_sync_state SET status='processing', claimed_at=now(), last_checked_at=now(), updated_at=now()
   WHERE tourn_id=_tourn_id;
  RETURN jsonb_build_object('decision','fetch','fingerprint',r.fingerprint);
END $$;

CREATE OR REPLACE FUNCTION public.tracker_pdga_sync_finish(
  _tourn_id text, _ok boolean, _payload jsonb, _fingerprint text, _interval_seconds int, _error text, _retry_after_seconds int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; wait int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
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

REVOKE ALL ON FUNCTION public.tracker_pdga_sync_claim(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tracker_pdga_sync_finish(text, boolean, jsonb, text, int, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracker_pdga_sync_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_pdga_sync_finish(text, boolean, jsonb, text, int, text, int) TO authenticated;