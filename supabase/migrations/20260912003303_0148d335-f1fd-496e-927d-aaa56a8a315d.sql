CREATE OR REPLACE FUNCTION public.get_effective_tier(_user uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE k text;
BEGIN
  PERFORM public.assert_self_or_admin(_user);
  SELECT o.tier_key INTO k
    FROM public.entitlement_overrides o
   WHERE o.user_id = _user
     AND (o.expires_at IS NULL OR o.expires_at > now())
   ORDER BY o.created_at DESC
   LIMIT 1;
  IF k IS NOT NULL THEN RETURN k; END IF;

  SELECT t.key INTO k
    FROM public.subscriptions s
    JOIN public.subscription_tiers t ON t.key = s.tier_key
   WHERE s.user_id = _user
     AND s.status IN ('active','trialing','past_due')
   ORDER BY s.updated_at DESC NULLS LAST
   LIMIT 1;

  RETURN COALESCE(k, 'free');
END; $$;