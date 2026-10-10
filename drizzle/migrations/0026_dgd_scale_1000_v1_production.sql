-- Phase 9: V1.3 production champion on the asymptotic 0-1000 DGD scale.
ALTER TABLE public.rating_model_versions DROP CONSTRAINT IF EXISTS rating_model_versions_shadow_stage_check;
ALTER TABLE public.rating_model_versions ADD CONSTRAINT rating_model_versions_shadow_stage_check
  CHECK (shadow_stage IS NULL OR shadow_stage = ANY (ARRAY['baseline','control','candidate','promotion_candidate','shadow_champion','rejected','production_champion','frozen_control','legacy_archived']));

UPDATE public.rating_model_versions SET shadow_stage = 'production_champion', status = 'active' WHERE id = 'dgd-core-v1.3@0.3.0';
UPDATE public.rating_model_versions SET shadow_stage = 'frozen_control', status = 'shadow' WHERE id = 'dgd-core-v1.2@0.2.0';

INSERT INTO public.dgd_display_scales (scale_version, model_version, transform_type, anchor, slope, params, min_behavior, max_behavior, calibration_dataset_version, status, notes)
VALUES ('dgd-scale-1000-v1', 'dgd-core-v1.3@0.3.0', 'LOGISTIC_1000', -13, 7.5, '{"midpoint": -13, "slope": 7.5, "ceiling": 1000, "public_max": 999}'::jsonb,
  'ASYMPTOTE_0', 'ASYMPTOTE_1000', 'cal-2026-10-05', 'PUBLIC',
  'Phase 9: DGD Rating = 1000 / (1 + exp(-(skill + 13) / 7.5)). 1000 is unreachable theoretical perfection. Validated on 1003 frozen V1.3 research players.')
ON CONFLICT (scale_version) DO NOTHING;
UPDATE public.dgd_display_scales SET status = 'RETIRED_PUBLIC', notes = coalesce(notes,'') || ' | Superseded by dgd-scale-1000-v1 (Phase 9).' WHERE scale_version = 'dgd-scale-B-linear-2.0-v13';

-- Stored V1.3 display values use the 50 + 2.5 x Skill placeholder; recover Skill then apply the logistic scale.
CREATE OR REPLACE FUNCTION public.dgd_scale_1000(_a numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _a IS NULL THEN NULL ELSE (1000.0 / (1.0 + exp(-(((_a - 50) / 2.5) + 13) / 7.5)))::numeric END $$;

-- Whole-number public value; never shows 1000 (theoretical perfection).
CREATE OR REPLACE FUNCTION public.dgd_scale_1000_public(_a numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _a IS NULL THEN NULL ELSE LEAST(999, round(public.dgd_scale_1000(_a)))::integer END $$;

-- Difference on the new scale between a value and (value - delta), both in placeholder units.
CREATE OR REPLACE FUNCTION public.dgd_scale_1000_delta(_a numeric, _d numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _a IS NULL OR _d IS NULL THEN NULL ELSE round(public.dgd_scale_1000(_a) - public.dgd_scale_1000(_a - _d)) END $$;

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
    RETURN jsonb_build_object('allowed', true, 'available', false, 'model', 'v13', 'scale_version', 'dgd-scale-1000-v1',
      'freshness', jsonb_build_object('last_calculated_at', f.last_calculated_at, 'latest_source_change_at', f.latest_source_change_at,
        'recalculation_pending', COALESCE(f.recalculation_pending, false), 'last_job_status', f.last_job_status, 'open_job', job));
  END IF;
  FOREACH k IN ARRAY ARRAY['last5','last10','last20'] LOOP
    IF s.recent ? k AND jsonb_typeof(s.recent->k) = 'object' THEN
      rec := rec || jsonb_build_object(k, (s.recent->k) || jsonb_build_object('avg_round_performance',
        public.dgd_scale_1000_public(NULLIF(s.recent->k->>'avg_round_performance','')::numeric)));
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'allowed', true, 'available', true, 'model', 'v13', 'model_version', s.model_version,
    'scale_version', 'dgd-scale-1000-v1', 'stage', 'public',
    'display_rating', public.dgd_scale_1000_public(s.display_rating), 'display_status', 'PUBLIC', 'rating_status', s.rating_status,
    'form_delta', public.dgd_scale_1000_delta(s.form_value, s.form_value - s.display_rating),
    'form_minus_skill', public.dgd_scale_1000_public(s.form_value) - public.dgd_scale_1000_public(s.display_rating),
    'form_value', public.dgd_scale_1000_public(s.form_value), 'form_rounds', s.form_rounds,
    'form_confidence', s.form_confidence, 'form_state', s.form_state, 'form_method', s.form_method,
    'confidence', round(s.confidence), 'trend', s.trend,
    'change_30', public.dgd_scale_1000_delta(s.display_rating, s.change_30), 'change_90', public.dgd_scale_1000_delta(s.display_rating, s.change_90),
    'change_180', public.dgd_scale_1000_delta(s.display_rating, s.change_180), 'volatility', round(s.volatility, 1),
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
    public.dgd_scale_1000_public(r.round_performance_display)::numeric, public.dgd_scale_1000_public(r.display_before)::numeric, public.dgd_scale_1000_public(r.display_after)::numeric,
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

GRANT EXECUTE ON FUNCTION public.dgd_scale_1000(numeric), public.dgd_scale_1000_public(numeric), public.dgd_scale_1000_delta(numeric, numeric) TO authenticated, service_role;