
-- ============================================================
-- SUBSCRIPTION TIERS
-- ============================================================
CREATE TABLE public.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  color text DEFAULT 'brand',
  icon text DEFAULT 'Sparkles',
  monthly_price_cents integer NOT NULL DEFAULT 0,
  yearly_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  trial_days integer NOT NULL DEFAULT 0,
  stripe_product_id text,
  stripe_monthly_price_id text,
  stripe_yearly_price_id text,
  apple_product_id text,
  google_product_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_tiers TO authenticated, anon;
GRANT ALL ON public.subscription_tiers TO service_role;
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiers_read_public" ON public.subscription_tiers FOR SELECT USING (is_public OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "tiers_admin_write" ON public.subscription_tiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- FEATURE FLAGS (registry)
-- ============================================================
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  unit text NOT NULL DEFAULT 'boolean' CHECK (unit IN ('boolean','count','per_month','per_day')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "features_read_auth" ON public.feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "features_admin_write" ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- TIER x FEATURE MATRIX
-- ============================================================
CREATE TABLE public.tier_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES public.subscription_tiers(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  limit_value integer,
  reset_period text CHECK (reset_period IN ('month','day','never')) DEFAULT 'never',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, feature_key)
);
GRANT SELECT ON public.tier_features TO authenticated;
GRANT ALL ON public.tier_features TO service_role;
ALTER TABLE public.tier_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tf_read_auth" ON public.tier_features FOR SELECT TO authenticated USING (true);
CREATE POLICY "tf_admin_write" ON public.tier_features FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tier_key text NOT NULL REFERENCES public.subscription_tiers(key),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','past_due','canceled','expired','comp','incomplete')),
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('stripe','apple','google','manual')),
  provider_customer_id text,
  provider_subscription_id text,
  interval text CHECK (interval IN ('month','year','lifetime')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs_read_own" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "subs_admin_write" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- ENTITLEMENT OVERRIDES (admin comps)
-- ============================================================
CREATE TABLE public.entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_key text NOT NULL REFERENCES public.subscription_tiers(key),
  reason text,
  granted_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entitlement_overrides TO authenticated;
GRANT ALL ON public.entitlement_overrides TO service_role;
ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eo_read_own" ON public.entitlement_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "eo_admin_write" ON public.entitlement_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- FEATURE USAGE (counters)
-- ============================================================
CREATE TABLE public.feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  period_start date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_key, period_start)
);
GRANT SELECT ON public.feature_usage TO authenticated;
GRANT ALL ON public.feature_usage TO service_role;
ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fu_read_own" ON public.feature_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- ============================================================
-- BILLING EVENTS (audit)
-- ============================================================
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  provider_event_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_ok boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_events_user_idx ON public.billing_events(user_id, created_at DESC);
CREATE INDEX billing_events_type_idx ON public.billing_events(event_type, created_at DESC);
GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "be_admin_read" ON public.billing_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR user_id = auth.uid());

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_effective_tier(_user uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  override_tier text;
  sub_tier text;
BEGIN
  IF _user IS NULL THEN RETURN 'free'; END IF;

  SELECT tier_key INTO override_tier
    FROM public.entitlement_overrides
   WHERE user_id = _user
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at DESC LIMIT 1;
  IF override_tier IS NOT NULL THEN RETURN override_tier; END IF;

  SELECT tier_key INTO sub_tier
    FROM public.subscriptions
   WHERE user_id = _user
     AND status IN ('active','trialing','comp','past_due')
     AND (current_period_end IS NULL OR current_period_end > now() - interval '3 days')
   LIMIT 1;
  IF sub_tier IS NOT NULL THEN RETURN sub_tier; END IF;

  RETURN 'free';
END; $$;

CREATE OR REPLACE FUNCTION public.has_feature(_user uuid, _feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT tf.enabled
      FROM public.tier_features tf
      JOIN public.subscription_tiers t ON t.id = tf.tier_id
     WHERE t.key = public.get_effective_tier(_user)
       AND tf.feature_key = _feature
     LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.feature_limit(_user uuid, _feature text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text := public.get_effective_tier(_user);
  tf record;
  cur_period date;
  used_count int := 0;
BEGIN
  SELECT tf2.enabled, tf2.limit_value, tf2.reset_period
    INTO tf
    FROM public.tier_features tf2
    JOIN public.subscription_tiers t ON t.id = tf2.tier_id
   WHERE t.key = tier AND tf2.feature_key = _feature
   LIMIT 1;

  IF NOT FOUND OR NOT tf.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_included', 'tier', tier);
  END IF;

  IF tf.limit_value IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'tier', tier);
  END IF;

  cur_period := CASE tf.reset_period
    WHEN 'day' THEN current_date
    WHEN 'month' THEN date_trunc('month', current_date)::date
    ELSE '1970-01-01'::date
  END;

  SELECT COALESCE(count,0) INTO used_count
    FROM public.feature_usage
   WHERE user_id = _user AND feature_key = _feature AND period_start = cur_period;

  RETURN jsonb_build_object(
    'allowed', used_count < tf.limit_value,
    'used', used_count,
    'limit', tf.limit_value,
    'reset_period', tf.reset_period,
    'period_start', cur_period,
    'tier', tier
  );
END; $$;

CREATE OR REPLACE FUNCTION public.consume_feature(_user uuid, _feature text, _amount int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tier text := public.get_effective_tier(_user);
  tf record;
  cur_period date;
  new_count int;
BEGIN
  IF _user IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason','no_user'); END IF;

  SELECT tf2.enabled, tf2.limit_value, tf2.reset_period
    INTO tf
    FROM public.tier_features tf2
    JOIN public.subscription_tiers t ON t.id = tf2.tier_id
   WHERE t.key = tier AND tf2.feature_key = _feature
   LIMIT 1;

  IF NOT FOUND OR NOT tf.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason','not_included','tier',tier);
  END IF;

  IF tf.limit_value IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'tier', tier);
  END IF;

  cur_period := CASE tf.reset_period
    WHEN 'day' THEN current_date
    WHEN 'month' THEN date_trunc('month', current_date)::date
    ELSE '1970-01-01'::date
  END;

  INSERT INTO public.feature_usage(user_id, feature_key, period_start, count)
  VALUES (_user, _feature, cur_period, _amount)
  ON CONFLICT (user_id, feature_key, period_start)
  DO UPDATE SET count = public.feature_usage.count + _amount,
                updated_at = now()
  RETURNING count INTO new_count;

  IF new_count > tf.limit_value THEN
    -- Roll back the increment
    UPDATE public.feature_usage
       SET count = count - _amount
     WHERE user_id = _user AND feature_key = _feature AND period_start = cur_period;
    RETURN jsonb_build_object(
      'allowed', false, 'reason','limit_reached',
      'used', tf.limit_value, 'limit', tf.limit_value, 'tier', tier
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'used', new_count, 'limit', tf.limit_value,
    'reset_period', tf.reset_period, 'tier', tier
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_effective_tier(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.feature_limit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_feature(uuid, text, int) TO authenticated;

-- Updated_at triggers
CREATE TRIGGER trg_st_updated BEFORE UPDATE ON public.subscription_tiers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ff_updated BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tf_updated BEFORE UPDATE ON public.tier_features FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sub_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_eo_updated BEFORE UPDATE ON public.entitlement_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SEED: tiers
-- ============================================================
INSERT INTO public.subscription_tiers (key, name, tagline, description, sort_order, monthly_price_cents, yearly_price_cents, color, icon) VALUES
  ('free',  'Free',  'Explore the full app with sensible caps.', 'Everything is previewable. Perfect for casual players.',                         10,   0,      0,   'muted',  'Circle'),
  ('pro',   'Pro',   'For serious players and small crews.',     'Full StatLink, Rating Studio, Course Book, and event hosting for your crew.', 20, 499,   4990,  'brand',  'Zap'),
  ('elite', 'Elite', 'For TDs, coaches, and touring pros.',      'Everything in Pro plus full AI SmartCaddy, unlimited hosting, admin exports.',30, 999,   9990,  'gold',   'Crown');

-- ============================================================
-- SEED: feature registry
-- ============================================================
INSERT INTO public.feature_flags (key, label, description, category, unit, sort_order) VALUES
  ('rounds.import',            'Round imports',           'PDGA / UDisc round imports per month',                     'data',      'per_month', 10),
  ('players.track',            'Tracked players',         'Players you can add to your Crew tracker',                 'social',    'count',     20),
  ('events.host_tournament',   'Host tournaments',        'Tournaments you can host concurrently',                    'events',    'count',     30),
  ('events.host_league',       'Host leagues',            'Active leagues you can host',                              'events',    'count',     40),
  ('stats.rating_studio',      'Rating Studio history',   'Full rating history and projection tools',                 'analytics', 'boolean',   50),
  ('stats.statlink_full',      'Full StatLink history',   'All time StatLink data (Free is limited to last 5 rounds)','analytics', 'boolean',   60),
  ('coursebook.entries',       'Course Book entries',     'Personal course notes you can save',                       'content',   'count',     70),
  ('gameplan.simulate',        'Game Plan simulations',   'Monte Carlo win-probability simulations per day',          'analytics', 'per_day',   80),
  ('ai.smartcaddy',            'Ask Ace (AI SmartCaddy)', 'AI chat messages with the SmartCaddy per day',             'ai',        'per_day',   90),
  ('ai.smartcaddy.local',      'Local answer database',   'Offline / local rulebook and knowledge base fallback',     'ai',        'boolean',  100),
  ('leaderboards.host',        'Host live leaderboards',  'Broadcast live scoring to spectators',                     'events',    'boolean',  110),
  ('leaderboards.broadcast',   'Public broadcast links',  'Shareable public spectator URLs',                          'events',    'boolean',  120),
  ('admin.exports',            'TD Pro exports',          'Field registry, scorecard, and payout CSV exports',        'admin',     'boolean',  130),
  ('support.priority',         'Priority support',        'Faster response times from the team',                      'support',   'boolean',  140);

-- ============================================================
-- SEED: tier x feature matrix (hybrid: everything previewable)
-- ============================================================
DO $$
DECLARE
  free_id uuid; pro_id uuid; elite_id uuid;
BEGIN
  SELECT id INTO free_id  FROM public.subscription_tiers WHERE key='free';
  SELECT id INTO pro_id   FROM public.subscription_tiers WHERE key='pro';
  SELECT id INTO elite_id FROM public.subscription_tiers WHERE key='elite';

  -- Free
  INSERT INTO public.tier_features (tier_id, feature_key, enabled, limit_value, reset_period) VALUES
    (free_id,'rounds.import',           true, 10,   'month'),
    (free_id,'players.track',           true,  3,   'never'),
    (free_id,'events.host_tournament',  true,  1,   'never'),
    (free_id,'events.host_league',      false, 0,   'never'),
    (free_id,'stats.rating_studio',     true,  NULL,'never'),
    (free_id,'stats.statlink_full',     false, NULL,'never'),
    (free_id,'coursebook.entries',      true,  5,   'never'),
    (free_id,'gameplan.simulate',       true,  1,   'day'),
    (free_id,'ai.smartcaddy',           true,  3,   'day'),
    (free_id,'ai.smartcaddy.local',     true,  NULL,'never'),
    (free_id,'leaderboards.host',       false, NULL,'never'),
    (free_id,'leaderboards.broadcast',  false, NULL,'never'),
    (free_id,'admin.exports',           false, NULL,'never'),
    (free_id,'support.priority',        false, NULL,'never');

  -- Pro
  INSERT INTO public.tier_features (tier_id, feature_key, enabled, limit_value, reset_period) VALUES
    (pro_id,'rounds.import',            true, 100,  'month'),
    (pro_id,'players.track',            true,  25,  'never'),
    (pro_id,'events.host_tournament',   true,   3,  'never'),
    (pro_id,'events.host_league',       true,   2,  'never'),
    (pro_id,'stats.rating_studio',      true,  NULL,'never'),
    (pro_id,'stats.statlink_full',      true,  NULL,'never'),
    (pro_id,'coursebook.entries',       true,  NULL,'never'),
    (pro_id,'gameplan.simulate',        true,  10,  'day'),
    (pro_id,'ai.smartcaddy',            true,  50,  'day'),
    (pro_id,'ai.smartcaddy.local',      true,  NULL,'never'),
    (pro_id,'leaderboards.host',        true,  NULL,'never'),
    (pro_id,'leaderboards.broadcast',   false, NULL,'never'),
    (pro_id,'admin.exports',            false, NULL,'never'),
    (pro_id,'support.priority',         true,  NULL,'never');

  -- Elite
  INSERT INTO public.tier_features (tier_id, feature_key, enabled, limit_value, reset_period) VALUES
    (elite_id,'rounds.import',          true, NULL, 'never'),
    (elite_id,'players.track',          true, NULL, 'never'),
    (elite_id,'events.host_tournament', true, NULL, 'never'),
    (elite_id,'events.host_league',     true, NULL, 'never'),
    (elite_id,'stats.rating_studio',    true, NULL, 'never'),
    (elite_id,'stats.statlink_full',    true, NULL, 'never'),
    (elite_id,'coursebook.entries',     true, NULL, 'never'),
    (elite_id,'gameplan.simulate',      true, NULL, 'never'),
    (elite_id,'ai.smartcaddy',          true, NULL, 'never'),
    (elite_id,'ai.smartcaddy.local',    true, NULL, 'never'),
    (elite_id,'leaderboards.host',      true, NULL, 'never'),
    (elite_id,'leaderboards.broadcast', true, NULL, 'never'),
    (elite_id,'admin.exports',          true, NULL, 'never'),
    (elite_id,'support.priority',       true, NULL, 'never');
END $$;
