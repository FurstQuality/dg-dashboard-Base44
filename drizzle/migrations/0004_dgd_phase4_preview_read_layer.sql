-- Phase 4: V1.1 preview persistence + safe read layer. Internal tables are admin-only;
-- players read their own rows only through SECURITY DEFINER functions gated by preview access.

CREATE TABLE public.dgd_preview_testers (
  user_id uuid PRIMARY KEY,
  added_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.dgd_preview_testers TO authenticated;
GRANT ALL ON public.dgd_preview_testers TO service_role;
ALTER TABLE public.dgd_preview_testers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage preview testers" ON public.dgd_preview_testers FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_v11_player_state (
  user_id uuid PRIMARY KEY,
  subject_id uuid NOT NULL,
  model_version text NOT NULL,
  report_id uuid,
  skill_latent numeric NOT NULL,
  skill_sigma numeric NOT NULL,
  display_rating numeric NOT NULL,
  display_status text NOT NULL DEFAULT 'UNCALIBRATED',
  form_delta numeric,
  form_rounds integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL,
  trend text NOT NULL DEFAULT 'insufficient',
  change_30 numeric, change_90 numeric, change_180 numeric,
  volatility numeric,
  eligible_rounds integer NOT NULL DEFAULT 0,
  excluded_rounds integer NOT NULL DEFAULT 0,
  last_played_on date,
  recent jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dgd_v11_player_state TO authenticated;
GRANT ALL ON public.dgd_v11_player_state TO service_role;
ALTER TABLE public.dgd_v11_player_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v11 state" ON public.dgd_v11_player_state FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_v11_round_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calibration_round_id uuid NOT NULL,
  model_version text NOT NULL,
  seq integer NOT NULL,
  played_on date NOT NULL,
  event_name text,
  division text,
  round_number integer,
  layout_name text,
  layout_key text,
  par integer,
  score integer NOT NULL,
  pdga_round_rating integer,
  status text NOT NULL,
  status_reason text,
  layout_knowledge text,
  pre_expected numeric,
  pre_strokes_vs_expectation numeric,
  likely_low numeric, likely_high numeric,
  ctx_expected numeric,
  ctx_strokes_vs_expectation numeric,
  event_adjustment numeric,
  round_performance_display numeric,
  display_before numeric, display_after numeric,
  confidence_before numeric, confidence_after numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, calibration_round_id, model_version)
);
CREATE INDEX dgd_v11_round_results_user_date ON public.dgd_v11_round_results (user_id, played_on DESC, seq DESC);
GRANT SELECT ON public.dgd_v11_round_results TO authenticated;
GRANT ALL ON public.dgd_v11_round_results TO service_role;
ALTER TABLE public.dgd_v11_round_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v11 rounds" ON public.dgd_v11_round_results FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_v11_layout_expectations (
  user_id uuid NOT NULL,
  layout_key text NOT NULL,
  model_version text NOT NULL,
  layout_name text,
  par integer,
  rounds_on_layout integer NOT NULL,
  player_rounds integer NOT NULL DEFAULT 0,
  expected numeric NOT NULL,
  likely_low numeric NOT NULL,
  likely_high numeric NOT NULL,
  layout_confidence text NOT NULL,
  best_score integer, avg_score numeric,
  PRIMARY KEY (user_id, layout_key, model_version)
);
GRANT SELECT ON public.dgd_v11_layout_expectations TO authenticated;
GRANT ALL ON public.dgd_v11_layout_expectations TO service_role;
ALTER TABLE public.dgd_v11_layout_expectations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v11 layouts" ON public.dgd_v11_layout_expectations FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.dgd_preview_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.dgd_preview_testers t WHERE t.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.dgd_v11_player_state; out jsonb;
BEGIN
  IF NOT public.dgd_preview_allowed() THEN RETURN jsonb_build_object('allowed', false); END IF;
  SELECT * INTO s FROM public.dgd_v11_player_state WHERE user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', true, 'available', false); END IF;
  out := jsonb_build_object(
    'allowed', true, 'available', true,
    'model_version', s.model_version, 'stage', (SELECT shadow_stage FROM public.rating_model_versions WHERE id = s.model_version),
    'display_rating', round(s.display_rating, 1), 'display_status', s.display_status,
    'form_delta', round(s.form_delta, 1), 'form_rounds', s.form_rounds,
    'confidence', round(s.confidence), 'trend', s.trend,
    'change_30', round(s.change_30, 1), 'change_90', round(s.change_90, 1), 'change_180', round(s.change_180, 1),
    'volatility', round(s.volatility, 1),
    'eligible_rounds', s.eligible_rounds, 'excluded_rounds', s.excluded_rounds,
    'last_played_on', s.last_played_on, 'updated_at', s.updated_at, 'recent', s.recent,
    'layouts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'layout_name', l.layout_name, 'par', l.par, 'player_rounds', l.player_rounds,
        'expected', round(l.expected, 1), 'likely_low', round(l.likely_low), 'likely_high', round(l.likely_high),
        'layout_confidence', l.layout_confidence, 'best_score', l.best_score, 'avg_score', round(l.avg_score, 1))
        ORDER BY l.player_rounds DESC, l.layout_name)
      FROM public.dgd_v11_layout_expectations l WHERE l.user_id = auth.uid() AND l.model_version = s.model_version), '[]'::jsonb)
  );
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_rounds(_limit integer DEFAULT 25, _offset integer DEFAULT 0, _status text DEFAULT NULL)
RETURNS TABLE (
  id uuid, played_on date, event_name text, division text, round_number integer, layout_name text, par integer,
  score integer, pdga_round_rating integer, status text, status_reason text, layout_knowledge text,
  pre_expected numeric, pre_strokes_vs_expectation numeric, likely_low numeric, likely_high numeric,
  ctx_expected numeric, ctx_strokes_vs_expectation numeric, event_adjustment numeric,
  round_performance_display numeric, display_before numeric, display_after numeric,
  confidence_before numeric, confidence_after numeric, total_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.played_on, r.event_name, r.division, r.round_number, r.layout_name, r.par,
    r.score, r.pdga_round_rating, r.status, r.status_reason, r.layout_knowledge,
    round(r.pre_expected, 1), round(r.pre_strokes_vs_expectation, 1), round(r.likely_low), round(r.likely_high),
    round(r.ctx_expected, 1), round(r.ctx_strokes_vs_expectation, 1), round(r.event_adjustment, 1),
    round(r.round_performance_display, 1), round(r.display_before, 1), round(r.display_after, 1),
    round(r.confidence_before), round(r.confidence_after),
    count(*) OVER ()
  FROM public.dgd_v11_round_results r
  JOIN public.dgd_v11_player_state s ON s.user_id = r.user_id AND s.model_version = r.model_version
  WHERE public.dgd_preview_allowed() AND r.user_id = auth.uid()
    AND (_status IS NULL OR r.status = _status)
  ORDER BY r.played_on DESC, r.seq DESC
  LIMIT LEAST(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0)
$$;

REVOKE ALL ON FUNCTION public.get_my_dgd_preview_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_dgd_preview_rounds(integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dgd_preview_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_rounds(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_preview_allowed() TO authenticated;