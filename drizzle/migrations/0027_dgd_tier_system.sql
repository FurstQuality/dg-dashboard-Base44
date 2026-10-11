-- Phase 9: DGD Tier (experience & contribution), independent of DGD Rating. Writes are service-role only.
CREATE TABLE public.dgd_tier_state (
  user_id uuid PRIMARY KEY,
  tier_version text NOT NULL,
  tier_score numeric NOT NULL DEFAULT 0,
  current_tier text NOT NULL DEFAULT 'GREEN' CHECK (current_tier IN ('GREEN','YELLOW','BRONZE','SILVER','GOLD')),
  highest_tier_earned text NOT NULL DEFAULT 'GREEN' CHECK (highest_tier_earned IN ('GREEN','YELLOW','BRONZE','SILVER','GOLD')),
  tier_earned_at timestamptz NOT NULL DEFAULT now(),
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  career jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_tier jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dgd_tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_tier text, to_tier text NOT NULL,
  tier_version text NOT NULL, tier_score numeric NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dgd_tier_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier_version text NOT NULL,
  category text NOT NULL,
  points numeric NOT NULL,
  source text NOT NULL,
  source_record text,
  verification text NOT NULL,
  detail text,
  occurred_on date,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dgd_tier_ledger_user_idx ON public.dgd_tier_ledger(user_id);
CREATE INDEX dgd_tier_history_user_idx ON public.dgd_tier_history(user_id, created_at DESC);
CREATE TABLE public.dgd_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PDGA_OFFICIAL','TOURNAMENT_DIRECTOR','LEAGUE_DIRECTOR','COURSE_STEWARD','CLUB_ORGANIZER','COURSE_DESIGNER')),
  source text NOT NULL,
  source_record text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','revoked','expired')),
  verified_at timestamptz,
  expires_at timestamptz,
  verified_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, source)
);
CREATE TABLE public.dgd_tier_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('EXPERIENCE','PLAYING','COURSES','EVENTS','SERVICE','CREDENTIALS')),
  points numeric NOT NULL CHECK (points BETWEEN -25 AND 25),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  admin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE public.dgd_tier_jobs (
  user_id uuid PRIMARY KEY,
  reason text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dgd_tier_state, public.dgd_tier_history, public.dgd_tier_ledger, public.dgd_credentials TO authenticated;
GRANT SELECT ON public.dgd_tier_adjustments TO authenticated;
GRANT ALL ON public.dgd_tier_state, public.dgd_tier_history, public.dgd_tier_ledger, public.dgd_credentials, public.dgd_tier_adjustments, public.dgd_tier_jobs TO service_role;

ALTER TABLE public.dgd_tier_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_tier_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_tier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_tier_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_tier_jobs ENABLE ROW LEVEL SECURITY;

-- Tier and verified credentials are public player identity for signed-in users; details are owner/admin.
CREATE POLICY "Signed-in users read tiers" ON public.dgd_tier_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner or admin reads tier history" ON public.dgd_tier_history FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Owner or admin reads tier ledger" ON public.dgd_tier_ledger FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Verified credentials are visible" ON public.dgd_credentials FOR SELECT TO authenticated USING (status = 'verified' OR user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Admins read tier adjustments" ON public.dgd_tier_adjustments FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Recalculation queue: evidence changes enqueue; never page loads.
CREATE OR REPLACE FUNCTION public.dgd_tier_enqueue(_user uuid, _reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ INSERT INTO public.dgd_tier_jobs(user_id, reason) SELECT _user, _reason WHERE _user IS NOT NULL
      ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, queued_at = now() $$;
REVOKE ALL ON FUNCTION public.dgd_tier_enqueue(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dgd_tier_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE col text := TG_ARGV[0]; u uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN EXECUTE format('SELECT ($1).%I', col) INTO u USING OLD; PERFORM public.dgd_tier_enqueue(u, TG_TABLE_NAME); END IF;
  IF TG_OP <> 'DELETE' THEN EXECUTE format('SELECT ($1).%I', col) INTO u USING NEW; PERFORM public.dgd_tier_enqueue(u, TG_TABLE_NAME); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER dgd_tier_canonical AFTER INSERT OR UPDATE OR DELETE ON public.canonical_rounds FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_external AFTER INSERT OR UPDATE OR DELETE ON public.external_rounds FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_contrib AFTER INSERT OR UPDATE OR DELETE ON public.contributions FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_event_mgr AFTER INSERT OR UPDATE OR DELETE ON public.event_managers FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_club_mem AFTER INSERT OR UPDATE OR DELETE ON public.club_members FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_director AFTER INSERT OR UPDATE OR DELETE ON public.director_profiles FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_leagues AFTER INSERT OR UPDATE OR DELETE ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('owner_id');
CREATE TRIGGER dgd_tier_tournaments AFTER INSERT OR UPDATE OR DELETE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('owner_id');
CREATE TRIGGER dgd_tier_credentials AFTER INSERT OR UPDATE OR DELETE ON public.dgd_credentials FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');
CREATE TRIGGER dgd_tier_adjust AFTER INSERT OR UPDATE OR DELETE ON public.dgd_tier_adjustments FOR EACH ROW EXECUTE FUNCTION public.dgd_tier_on_change('user_id');

-- Backfill: queue every player with rounds.
INSERT INTO public.dgd_tier_jobs(user_id, reason) SELECT DISTINCT user_id, 'phase9_backfill' FROM public.canonical_rounds WHERE user_id IS NOT NULL ON CONFLICT DO NOTHING;