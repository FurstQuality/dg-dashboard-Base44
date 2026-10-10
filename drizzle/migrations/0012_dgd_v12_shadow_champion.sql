CREATE TABLE public.dgd_v12_player_state (LIKE public.dgd_v11_player_state INCLUDING DEFAULTS);
ALTER TABLE public.dgd_v12_player_state ADD PRIMARY KEY (user_id),
  ADD COLUMN form_method text, ADD COLUMN form_confidence text, ADD COLUMN form_state text,
  ADD COLUMN form_reliable_rounds integer, ADD COLUMN form_effective_rounds numeric;
GRANT SELECT ON public.dgd_v12_player_state TO authenticated;
GRANT ALL ON public.dgd_v12_player_state TO service_role;
ALTER TABLE public.dgd_v12_player_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read V1.2 states" ON public.dgd_v12_player_state FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_v12_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model_version text NOT NULL,
  state jsonb NOT NULL,
  superseded_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
CREATE INDEX dgd_v12_state_history_user ON public.dgd_v12_state_history (user_id, superseded_at DESC);
GRANT SELECT ON public.dgd_v12_state_history TO authenticated;
GRANT ALL ON public.dgd_v12_state_history TO service_role;
ALTER TABLE public.dgd_v12_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read V1.2 history" ON public.dgd_v12_state_history FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_source_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_round_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  state text NOT NULL DEFAULT 'SOURCE_CONFLICT',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_round_id, kind)
);
GRANT SELECT, UPDATE ON public.dgd_source_conflicts TO authenticated;
GRANT ALL ON public.dgd_source_conflicts TO service_role;
ALTER TABLE public.dgd_source_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read conflicts" ON public.dgd_source_conflicts FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Admins review conflicts" ON public.dgd_source_conflicts FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

ALTER TABLE public.dgd_v11_round_results
  ADD COLUMN context_status text, ADD COLUMN field_known_players integer, ADD COLUMN field_known_scores integer,
  ADD COLUMN field_full_count integer, ADD COLUMN field_coverage_ratio numeric, ADD COLUMN effective_field_count numeric,
  ADD COLUMN field_context_confidence text, ADD COLUMN source_conflict text;

-- Historical context enrichment replays the player's history from that round's date.
CREATE OR REPLACE FUNCTION public.dgd_v12_on_context_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.superseded_at IS NULL THEN
    PERFORM public.dgd_v11_enqueue(NEW.user_id, 'context_enrichment', NEW.played_on);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.dgd_v12_on_context_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER dgd_v12_context_change AFTER INSERT ON public.pdga_round_context
  FOR EACH ROW EXECUTE FUNCTION public.dgd_v12_on_context_change();

-- Preview summary: V1.2 by default; V1.1 control only for platform admins.
CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_summary_v2(_model text DEFAULT 'v12')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; f public.dgd_v11_freshness; job text; m text; is_admin boolean; v12_ok boolean; v11_ok boolean;
BEGIN
  IF NOT public.dgd_preview_allowed() THEN RETURN jsonb_build_object('allowed', false); END IF;
  is_admin := public.is_platform_admin(auth.uid());
  m := CASE WHEN _model = 'v11' AND is_admin THEN 'v11' ELSE 'v12' END;
  SELECT * INTO f FROM public.dgd_v11_freshness WHERE user_id = auth.uid();
  SELECT status INTO job FROM public.dgd_v11_jobs WHERE user_id = auth.uid() AND status IN ('queued','processing','retry_pending') ORDER BY created_at DESC LIMIT 1;
  v12_ok := EXISTS (SELECT 1 FROM public.dgd_v12_player_state WHERE user_id = auth.uid());
  v11_ok := EXISTS (SELECT 1 FROM public.dgd_v11_player_state WHERE user_id = auth.uid());
  IF m = 'v12' THEN
    SELECT to_jsonb(x) AS j INTO s FROM public.dgd_v12_player_state x WHERE x.user_id = auth.uid();
  ELSE
    SELECT to_jsonb(x) AS j INTO s FROM public.dgd_v11_player_state x WHERE x.user_id = auth.uid();
  END IF;
  IF s IS NULL OR s.j IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'available', false, 'model', m, 'can_compare_v11', is_admin AND v11_ok,
      'freshness', jsonb_build_object('last_calculated_at', f.last_calculated_at, 'latest_source_change_at', f.latest_source_change_at,
        'recalculation_pending', COALESCE(f.recalculation_pending, false), 'last_job_status', f.last_job_status, 'open_job', job));
  END IF;
  RETURN jsonb_build_object(
    'allowed', true, 'available', true, 'model', m, 'can_compare_v11', is_admin AND v11_ok,
    'model_version', s.j->>'model_version', 'stage', (SELECT shadow_stage FROM public.rating_model_versions WHERE id = s.j->>'model_version'),
    'display_rating', round((s.j->>'display_rating')::numeric, 1), 'display_status', s.j->>'display_status', 'rating_status', s.j->>'rating_status',
    'form_delta', round((s.j->>'form_delta')::numeric, 1), 'form_minus_skill', round((s.j->>'form_delta')::numeric, 1),
    'form_value', round((s.j->>'form_value')::numeric, 1), 'form_rounds', (s.j->>'form_rounds')::int,
    'form_confidence', s.j->>'form_confidence', 'form_state', s.j->>'form_state', 'form_method', s.j->>'form_method',
    'confidence', round((s.j->>'confidence')::numeric), 'trend', s.j->>'trend',
    'change_30', round((s.j->>'change_30')::numeric, 1), 'change_90', round((s.j->>'change_90')::numeric, 1), 'change_180', round((s.j->>'change_180')::numeric, 1),
    'volatility', round((s.j->>'volatility')::numeric, 1),
    'eligible_rounds', (s.j->>'eligible_rounds')::int, 'excluded_rounds', (s.j->>'excluded_rounds')::int,
    'last_played_on', s.j->>'last_played_on', 'updated_at', s.j->>'updated_at', 'recent', s.j->'recent', 'coverage', s.j->'coverage',
    'freshness', jsonb_build_object('last_calculated_at', COALESCE(f.last_calculated_at, (s.j->>'updated_at')::timestamptz), 'latest_eligible_round_at', f.latest_eligible_round_at,
      'latest_source_change_at', f.latest_source_change_at, 'recalculation_pending', COALESCE(f.recalculation_pending, false),
      'last_job_status', f.last_job_status, 'open_job', job),
    'layouts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'layout_name', l.layout_name, 'par', l.par, 'player_rounds', l.player_rounds,
        'expected', round(l.expected, 1), 'likely_low', round(l.likely_low), 'likely_high', round(l.likely_high),
        'layout_confidence', l.layout_confidence, 'best_score', l.best_score, 'avg_score', round(l.avg_score, 1))
        ORDER BY l.player_rounds DESC, l.layout_name)
      FROM public.dgd_v11_layout_expectations l WHERE l.user_id = auth.uid() AND l.model_version = s.j->>'model_version'), '[]'::jsonb)
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.get_my_dgd_preview_summary_v2(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_summary_v2(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_rounds_v4(_model text DEFAULT 'v12', _limit integer DEFAULT 25, _offset integer DEFAULT 0, _source text DEFAULT NULL, _rated boolean DEFAULT NULL, _category text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _course text DEFAULT NULL)
RETURNS TABLE(id uuid, played_on date, event_name text, division text, round_number integer, layout_name text, course_name text, par integer, score integer, pdga_round_rating integer, udisc_round_rating integer, legacy_round_rating integer, status text, status_reason text, layout_knowledge text, pre_expected numeric, pre_strokes_vs_expectation numeric, likely_low numeric, likely_high numeric, ctx_expected numeric, ctx_strokes_vs_expectation numeric, event_adjustment numeric, round_performance_display numeric, display_before numeric, display_after numeric, confidence_before numeric, confidence_after numeric, sources text[], category text, field_context_confidence text, field_known_players integer, field_coverage_ratio numeric, source_conflict text, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mv text;
BEGIN
  IF NOT public.dgd_preview_allowed() THEN RETURN; END IF;
  SELECT st.model_version INTO mv FROM (
    SELECT model_version FROM public.dgd_v11_player_state WHERE user_id = auth.uid() AND _model = 'v11' AND public.is_platform_admin(auth.uid())
    UNION ALL SELECT model_version FROM public.dgd_v12_player_state WHERE user_id = auth.uid() AND NOT (_model = 'v11' AND public.is_platform_admin(auth.uid()))
  ) st LIMIT 1;
  IF mv IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT r.id, r.played_on, r.event_name, r.division, r.round_number, r.layout_name, r.course_name, r.par,
    r.score, r.pdga_round_rating, r.udisc_round_rating, r.legacy_round_rating, r.status, r.status_reason, r.layout_knowledge,
    round(r.pre_expected, 1), round(r.pre_strokes_vs_expectation, 1), round(r.likely_low), round(r.likely_high),
    round(r.ctx_expected, 1), round(r.ctx_strokes_vs_expectation, 1), round(r.event_adjustment, 1),
    round(r.round_performance_display, 1), round(r.display_before, 1), round(r.display_after, 1),
    round(r.confidence_before), round(r.confidence_after), r.sources, r.category,
    r.field_context_confidence, r.field_known_players, round(r.field_coverage_ratio, 2), r.source_conflict,
    count(*) OVER ()
  FROM public.dgd_v11_round_results r
  WHERE r.user_id = auth.uid() AND r.model_version = mv AND r.canonical_round_id IS NOT NULL
    AND (_source IS NULL OR _source = ANY(r.sources))
    AND (_rated IS NULL OR (_rated AND r.status IN ('rated','provisional')) OR (NOT _rated AND r.status NOT IN ('rated','provisional')))
    AND (_category IS NULL OR r.category = _category)
    AND (_from IS NULL OR r.played_on >= _from) AND (_to IS NULL OR r.played_on <= _to)
    AND (_course IS NULL OR r.course_name ILIKE '%' || _course || '%' OR r.event_name ILIKE '%' || _course || '%')
  ORDER BY r.played_on DESC, r.seq DESC
  LIMIT LEAST(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_my_dgd_preview_rounds_v4(text, integer, integer, text, boolean, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_rounds_v4(text, integer, integer, text, boolean, text, date, date, text) TO authenticated;