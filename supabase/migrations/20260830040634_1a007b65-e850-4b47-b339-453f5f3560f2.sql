-- 1. Self-or-admin guard helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_self_or_admin(_user uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  -- No JWT (service role / internal job): allow.
  IF caller IS NULL THEN RETURN; END IF;
  IF _user IS NOT NULL AND _user = caller THEN RETURN; END IF;
  IF public.has_role(caller, 'admin') OR public.has_role(caller, 'super_admin') THEN RETURN; END IF;
  RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
END; $$;

REVOKE ALL ON FUNCTION public.assert_self_or_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_self_or_admin(uuid) TO authenticated, service_role;

-- 2. Scope per-user entitlement helpers to the caller ---------------------------
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
    JOIN public.subscription_tiers t ON t.id = s.tier_id
   WHERE s.user_id = _user
     AND s.status IN ('active','trialing','past_due')
   ORDER BY s.updated_at DESC NULLS LAST
   LIMIT 1;

  RETURN COALESCE(k, 'free');
END; $$;

CREATE OR REPLACE FUNCTION public.has_feature(_user uuid, _feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tier text;
BEGIN
  PERFORM public.assert_self_or_admin(_user);
  tier := public.get_effective_tier(_user);
  RETURN EXISTS (
    SELECT 1 FROM public.tier_features tf
      JOIN public.subscription_tiers t ON t.id = tf.tier_id
     WHERE t.key = tier AND tf.feature_key = _feature AND tf.enabled
  );
END; $$;

-- 3. Beta counter triggers: not client-callable ---------------------------------
REVOKE EXECUTE ON FUNCTION public.bump_beta_comment_count() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_beta_vote_count() FROM authenticated;

-- 4. Profiles: stop leaking feed tokens and preference blobs -------------------
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, username, display_name, bio, avatar_url, cover_url, home_course, location,
  pdga_number, pdga_rating, bag, created_at, updated_at, home_state, player_since,
  favorite_ace, ace_count_manual, calendar_shared_with_friends, preferred_division,
  pdga_profile_url, scene_profile_url, udisc_profile_url, scene_profile_urls
) ON public.profiles TO authenticated;

CREATE OR REPLACE VIEW public.my_profile_settings
WITH (security_invoker = false) AS
SELECT p.id, p.notification_prefs, p.privacy_prefs
  FROM public.profiles p
 WHERE p.id = auth.uid();

REVOKE ALL ON public.my_profile_settings FROM anon;
GRANT SELECT ON public.my_profile_settings TO authenticated, service_role;
