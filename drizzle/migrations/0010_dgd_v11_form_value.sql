ALTER TABLE public.dgd_v11_player_state ADD COLUMN IF NOT EXISTS form_value numeric;
COMMENT ON COLUMN public.dgd_v11_player_state.form_value IS 'FORM_VALUE: mean recent DGD round performance (display scale).';
COMMENT ON COLUMN public.dgd_v11_player_state.form_delta IS 'FORM_MINUS_SKILL: form_value minus display_rating. Label as Form vs Skill.';
UPDATE public.dgd_v11_player_state SET form_value = display_rating + form_delta WHERE form_value IS NULL AND form_delta IS NOT NULL;
CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.dgd_v11_player_state; f public.dgd_v11_freshness; job text; out jsonb;
BEGIN
  IF NOT public.dgd_preview_allowed() THEN RETURN jsonb_build_object('allowed', false); END IF;
  SELECT * INTO f FROM public.dgd_v11_freshness WHERE user_id = auth.uid();
  SELECT status INTO job FROM public.dgd_v11_jobs WHERE user_id = auth.uid() AND status IN ('queued','processing','retry_pending') ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO s FROM public.dgd_v11_player_state WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'available', false,
      'freshness', jsonb_build_object('last_calculated_at', f.last_calculated_at, 'latest_source_change_at', f.latest_source_change_at,
        'recalculation_pending', COALESCE(f.recalculation_pending, false), 'last_job_status', f.last_job_status, 'open_job', job));
  END IF;
  out := jsonb_build_object(
    'allowed', true, 'available', true,
    'model_version', s.model_version, 'stage', (SELECT shadow_stage FROM public.rating_model_versions WHERE id = s.model_version),
    'display_rating', round(s.display_rating, 1), 'display_status', s.display_status, 'rating_status', s.rating_status,
    'form_delta', round(s.form_delta, 1), 'form_minus_skill', round(s.form_delta, 1),
    'form_value', round(COALESCE(s.form_value, s.display_rating + s.form_delta), 1), 'form_rounds', s.form_rounds,
    'confidence', round(s.confidence), 'trend', s.trend,
    'change_30', round(s.change_30, 1), 'change_90', round(s.change_90, 1), 'change_180', round(s.change_180, 1),
    'volatility', round(s.volatility, 1),
    'eligible_rounds', s.eligible_rounds, 'excluded_rounds', s.excluded_rounds,
    'last_played_on', s.last_played_on, 'updated_at', s.updated_at, 'recent', s.recent,
    'coverage', s.coverage,
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
  RETURN out;
END $function$;