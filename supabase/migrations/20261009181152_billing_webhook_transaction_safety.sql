-- One transaction records the delivery and changes the entitlement. A failed
-- write rolls back both, so the provider can retry without losing a payment.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_state_at timestamptz;

CREATE TABLE public.billing_webhook_receipts (
  provider text NOT NULL CHECK (provider IN ('stripe', 'apple', 'google')),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id text NOT NULL,
  state_at timestamptz NOT NULL,
  result text NOT NULL CHECK (result IN ('applied', 'stale', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
CREATE INDEX billing_receipts_subscription_idx ON public.billing_webhook_receipts(provider, subscription_id);
CREATE INDEX billing_receipts_user_idx ON public.billing_webhook_receipts(user_id);
ALTER TABLE public.billing_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_webhook_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.billing_webhook_receipts TO service_role;

CREATE FUNCTION public.billing_webhook_security_version() RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT 1; $$;
REVOKE ALL ON FUNCTION public.billing_webhook_security_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_webhook_security_version() TO service_role;

CREATE FUNCTION public.apply_billing_webhook(
  p_provider text, p_event_id text, p_event_type text, p_state_at timestamptz, p_state jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user uuid := (p_state->>'user_id')::uuid;
  v_sub text := p_state->>'provider_subscription_id';
  v_customer text := p_state->>'provider_customer_id';
  v_existing public.subscriptions%ROWTYPE;
  v_result text := 'applied';
  v_duplicate text;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('stripe','apple','google') OR v_user IS NULL
    OR p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 200
    OR p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 100
    OR v_sub IS NULL OR length(v_sub) NOT BETWEEN 1 AND 255
    OR v_customer IS NULL OR length(v_customer) NOT BETWEEN 1 AND 255
    OR p_state_at IS NULL OR p_state_at > clock_timestamp() + interval '5 minutes'
    OR p_state->>'status' IS NULL OR p_state->>'status' NOT IN ('active','trialing','past_due','canceled','expired','incomplete')
    OR (p_state->>'status' IN ('active','trialing','past_due') AND p_state->>'current_period_end' IS NULL)
  THEN RAISE EXCEPTION 'invalid_billing_state'; END IF;

  -- Subscription lock also prevents the same purchase being assigned to two users.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing:' || p_provider || ':' || v_sub, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing:customer:' || p_provider || ':' || v_customer, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing:user:' || v_user::text, 0));
  SELECT result INTO v_duplicate FROM public.billing_webhook_receipts
    WHERE provider = p_provider AND event_id = p_event_id;
  IF FOUND THEN RETURN 'duplicate'; END IF;

  IF EXISTS (SELECT 1 FROM public.billing_webhook_receipts
      WHERE provider = p_provider AND subscription_id = v_sub AND user_id <> v_user)
    OR EXISTS (SELECT 1 FROM public.subscriptions WHERE provider = p_provider
      AND (provider_subscription_id = v_sub OR provider_customer_id = v_customer) AND user_id <> v_user)
  THEN RAISE EXCEPTION 'billing_owner_conflict'; END IF;

  SELECT * INTO v_existing FROM public.subscriptions WHERE user_id = v_user FOR UPDATE;
  IF FOUND THEN
    IF v_existing.provider_state_at IS NOT NULL AND p_state_at <= v_existing.provider_state_at THEN
      v_result := 'stale';
    ELSIF v_existing.provider IS DISTINCT FROM p_provider
      OR v_existing.provider_subscription_id IS DISTINCT FROM v_sub THEN
      -- An old cancellation must not cancel the replacement subscription. An
      -- active purchase from another provider requires explicit reconciliation.
      IF p_state->>'status' NOT IN ('active','trialing') THEN
        v_result := 'superseded';
      ELSIF v_existing.status IN ('active','trialing','past_due','comp','incomplete')
        AND (v_existing.current_period_end IS NULL OR v_existing.current_period_end > now()) THEN
        RAISE EXCEPTION 'billing_subscription_conflict';
      END IF;
    END IF;
  END IF;

  IF v_result = 'applied' THEN
    INSERT INTO public.subscriptions(user_id, tier_key, status, provider,
      provider_customer_id, provider_subscription_id, interval,
      current_period_start, current_period_end, trial_end, cancel_at_period_end,
      canceled_at, provider_state_at)
    VALUES(v_user, p_state->>'tier_key', p_state->>'status', p_provider,
      v_customer, v_sub, p_state->>'interval',
      (p_state->>'current_period_start')::timestamptz, (p_state->>'current_period_end')::timestamptz,
      (p_state->>'trial_end')::timestamptz, COALESCE((p_state->>'cancel_at_period_end')::boolean, false),
      (p_state->>'canceled_at')::timestamptz, p_state_at)
    ON CONFLICT(user_id) DO UPDATE SET
      tier_key = EXCLUDED.tier_key, status = EXCLUDED.status, provider = EXCLUDED.provider,
      provider_customer_id = EXCLUDED.provider_customer_id,
      provider_subscription_id = EXCLUDED.provider_subscription_id, interval = EXCLUDED.interval,
      current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
      trial_end = EXCLUDED.trial_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      canceled_at = EXCLUDED.canceled_at, provider_state_at = EXCLUDED.provider_state_at, updated_at = now();
  END IF;

  INSERT INTO public.billing_webhook_receipts(provider, event_id, user_id, subscription_id, state_at, result)
    VALUES(p_provider, p_event_id, v_user, v_sub, p_state_at, v_result);
  -- Retain an audit without retaining raw webhook customer/payment payloads.
  INSERT INTO public.billing_events(user_id, provider, event_type, provider_event_id, payload, processed_ok)
    VALUES(v_user, p_provider, p_event_type, p_event_id,
      jsonb_build_object('subscription_id', v_sub, 'tier_key', p_state->>'tier_key',
        'status', p_state->>'status', 'result', v_result), true);
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.apply_billing_webhook(text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_billing_webhook(text,text,text,timestamptz,jsonb) TO service_role;
