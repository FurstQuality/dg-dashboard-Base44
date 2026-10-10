-- Public DGD Rating = V1.3 (dgd-core-v1.3@0.3.0) on Scale B: 50 + 2 x Skill.
-- Stored V1.3 display values use the 50 + 2.5 x Skill placeholder, so convert linearly.
CREATE OR REPLACE FUNCTION public.dgd_scale_b(_a numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _a IS NULL THEN NULL ELSE 50 + 0.8 * (_a - 50) END $$;

CREATE OR REPLACE FUNCTION public.dgd_scale_b_delta(_d numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _d IS NULL THEN NULL ELSE 0.8 * _d END $$;

CREATE OR REPLACE FUNCTION public.get_my_dgd_rating()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.dgd_v13_player_state; f public.dgd_v11_freshness; job text; rec jsonb := '{}'::jsonb; k text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('allowed', false); END IF;
  SELECT * INTO f FROM public.dgd_v11_freshness WHERE user_id = auth.uid();
  SELECT status INTO job FROM public.dgd_v11_jobs WHERE user_id = auth.uid() AND status IN ('queued','processing','retry_pending') ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO s FROM public.dgd_v13_player_state WHERE user_id = auth.uid();
  IF s.user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'available', false, 'model', 'v13',
      'freshness', jsonb_build_object('last_calculated_at', f.last_calculated_at, 'latest_source_change_at', f.latest_source_change_at,
        'recalculation_pending', COALESCE(f.recalculation_pending, false), 'last_job_status', f.last_job_status, 'open_job', job));
  END IF;
  FOREACH k IN ARRAY ARRAY['last5','last10','last20'] LOOP
    IF s.recent ? k AND jsonb_typeof(s.recent->k) = 'object' THEN
      rec := rec || jsonb_build_object(k, (s.recent->k) || jsonb_build_object('avg_round_performance',
        round(public.dgd_scale_b(NULLIF(s.recent->k->>'avg_round_performance','')::numeric), 1)));
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'allowed', true, 'available', true, 'model', 'v13', 'model_version', s.model_version,
    'scale_version', 'dgd-scale-B-linear-2.0-v13', 'stage', 'public',
    'display_rating', round(public.dgd_scale_b(s.display_rating), 1), 'display_status', 'PUBLIC', 'rating_status', s.rating_status,
    'form_delta', round(public.dgd_scale_b_delta(s.form_delta), 1), 'form_minus_skill', round(public.dgd_scale_b_delta(s.form_delta), 1),
    'form_value', round(public.dgd_scale_b(s.form_value), 1), 'form_rounds', s.form_rounds,
    'form_confidence', s.form_confidence, 'form_state', s.form_state, 'form_method', s.form_method,
    'confidence', round(s.confidence), 'trend', s.trend,
    'change_30', round(public.dgd_scale_b_delta(s.change_30), 1), 'change_90', round(public.dgd_scale_b_delta(s.change_90), 1),
    'change_180', round(public.dgd_scale_b_delta(s.change_180), 1), 'volatility', round(s.volatility, 1),
    'eligible_rounds', s.eligible_rounds, 'excluded_rounds', s.excluded_rounds,
    'last_played_on', s.last_played_on, 'updated_at', s.updated_at, 'recent', rec, 'coverage', s.coverage,
    'freshness', jsonb_build_object('last_calculated_at', COALESCE(f.last_calculated_at, s.updated_at), 'latest_eligible_round_at', f.latest_eligible_round_at,
      'latest_source_change_at', f.latest_source_change_at, 'recalculation_pending', COALESCE(f.recalculation_pending, false),
      'last_job_status', f.last_job_status, 'open_job', job),
    'layouts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'layout_name', l.layout_name, 'par', l.par, 'player_rounds', l.player_rounds,
        'expected', round(l.expected, 1), 'likely_low', round(l.likely_low), 'likely_high', round(l.likely_high),
        'layout_confidence', l.layout_confidence, 'best_score', l.best_score, 'avg_score', round(l.avg_score, 1))
        ORDER BY l.player_rounds DESC, l.layout_name)
      FROM public.dgd_v11_layout_expectations l WHERE l.user_id = auth.uid() AND l.model_version = s.model_version), '[]'::jsonb)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_dgd_rating_rounds(_limit integer DEFAULT 25, _offset integer DEFAULT 0, _source text DEFAULT NULL, _rated boolean DEFAULT NULL, _category text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _course text DEFAULT NULL)
RETURNS TABLE(id uuid, played_on date, event_name text, division text, round_number integer, layout_name text, course_name text, par integer, score integer, pdga_round_rating integer, udisc_round_rating integer, legacy_round_rating integer, status text, status_reason text, layout_knowledge text, pre_expected numeric, pre_strokes_vs_expectation numeric, likely_low numeric, likely_high numeric, ctx_expected numeric, ctx_strokes_vs_expectation numeric, event_adjustment numeric, round_performance_display numeric, display_before numeric, display_after numeric, confidence_before numeric, confidence_after numeric, sources text[], category text, field_context_confidence text, field_known_players integer, field_coverage_ratio numeric, source_conflict text, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.id, r.played_on, r.event_name, r.division, r.round_number, r.layout_name, r.course_name, r.par,
    r.score, r.pdga_round_rating, r.udisc_round_rating, r.legacy_round_rating, r.status, r.status_reason, r.layout_knowledge,
    round(r.pre_expected, 1), round(r.pre_strokes_vs_expectation, 1), round(r.likely_low), round(r.likely_high),
    round(r.ctx_expected, 1), round(r.ctx_strokes_vs_expectation, 1), round(r.event_adjustment, 1),
    round(public.dgd_scale_b(r.round_performance_display), 1), round(public.dgd_scale_b(r.display_before), 1), round(public.dgd_scale_b(r.display_after), 1),
    round(r.confidence_before), round(r.confidence_after), r.sources, r.category,
    r.field_context_confidence, r.field_known_players, round(r.field_coverage_ratio, 2), r.source_conflict,
    count(*) OVER ()
  FROM public.dgd_v11_round_results r
  WHERE auth.uid() IS NOT NULL AND r.user_id = auth.uid() AND r.model_version = 'dgd-core-v1.3@0.3.0' AND r.canonical_round_id IS NOT NULL
    AND (_source IS NULL OR _source = ANY(r.sources))
    AND (_rated IS NULL OR (_rated AND r.status IN ('rated','provisional')) OR (NOT _rated AND r.status NOT IN ('rated','provisional')))
    AND (_category IS NULL OR r.category = _category)
    AND (_from IS NULL OR r.played_on >= _from) AND (_to IS NULL OR r.played_on <= _to)
    AND (_course IS NULL OR r.course_name ILIKE '%' || _course || '%' OR r.event_name ILIKE '%' || _course || '%')
  ORDER BY r.played_on DESC, r.seq DESC
  LIMIT LEAST(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0);
$function$;

REVOKE ALL ON FUNCTION public.get_my_dgd_rating() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_dgd_rating_rounds(integer, integer, text, boolean, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_rating() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_rating_rounds(integer, integer, text, boolean, text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_scale_b(numeric), public.dgd_scale_b_delta(numeric) TO authenticated, service_role;