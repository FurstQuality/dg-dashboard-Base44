CREATE TABLE public.dgd_round_normalization (
  canonical_round_id uuid PRIMARY KEY REFERENCES public.canonical_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  hole_count integer,
  hole_count_origin text NOT NULL DEFAULT 'UNKNOWN' CHECK (hole_count_origin IN ('IMPORTED','HOLE_SCORE_COUNT','LAYOUT_INFERRED','EVENT_INFERRED','MANUAL','UNKNOWN')),
  to_par integer,
  par_played integer,
  course_id uuid,
  layout_id uuid,
  layout_mapping text NOT NULL DEFAULT 'UNMAPPED' CHECK (layout_mapping IN ('EXACT','HIGH_CONFIDENCE','POSSIBLE','UNMAPPED')),
  mapping_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_issue text,
  data_issue_detail text,
  normalized_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dgd_round_normalization TO authenticated;
GRANT ALL ON public.dgd_round_normalization TO service_role;
ALTER TABLE public.dgd_round_normalization ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read round normalization" ON public.dgd_round_normalization FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE INDEX dgd_round_normalization_user_idx ON public.dgd_round_normalization(user_id);

CREATE TABLE public.dgd_duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_round_id uuid NOT NULL,
  counterpart_round_id uuid,
  user_id uuid NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('LINK','KEEP_SEPARATE','NEEDS_REVIEW')),
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_round_id)
);
GRANT SELECT ON public.dgd_duplicate_reviews TO authenticated;
GRANT ALL ON public.dgd_duplicate_reviews TO service_role;
ALTER TABLE public.dgd_duplicate_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read duplicate reviews" ON public.dgd_duplicate_reviews FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

ALTER TABLE public.dgd_round_eligibility
  ADD COLUMN state text NOT NULL DEFAULT 'ELIGIBLE' CHECK (state IN ('ELIGIBLE','INELIGIBLE','PENDING_REVIEW','EXCLUDED')),
  ADD COLUMN reason_codes text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.dgd_layout_difficulty
  ADD COLUMN effective_player_count double precision NOT NULL DEFAULT 0,
  ADD COLUMN skill_range double precision,
  ADD COLUMN recent_round_count integer NOT NULL DEFAULT 0,
  ADD COLUMN layout_mapping text;
ALTER TABLE public.dgd_layout_difficulty DROP CONSTRAINT dgd_layout_difficulty_status_check;
ALTER TABLE public.dgd_layout_difficulty ADD CONSTRAINT dgd_layout_difficulty_status_check CHECK (status IN ('unrated','provisional','developing','established'));

ALTER TABLE public.dgd_calc_runs
  ADD COLUMN iteration_count integer,
  ADD COLUMN convergence_status text CHECK (convergence_status IN ('CONVERGED','NOT_CONVERGED')),
  ADD COLUMN final_delta jsonb,
  ADD COLUMN stop_reason text;

CREATE OR REPLACE FUNCTION public.dgd_v1_apply_layouts(_run uuid, _model text, _layouts jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO dgd_layout_difficulty (model_version, layout_key, course_key, course_name, layout_name, difficulty_mu,
    difficulty_sigma, sample_size, player_count, status, fitted_run_id, fitted_at, effective_player_count, skill_range,
    recent_round_count, layout_mapping)
  SELECT _model, l.layout_key, l.course_key, l.course_name, l.layout_name, l.difficulty_mu, l.difficulty_sigma,
    l.sample_size, l.player_count, l.status, _run, now(), coalesce(l.effective_player_count,0), l.skill_range,
    coalesce(l.recent_round_count,0), l.layout_mapping
  FROM jsonb_to_recordset(_layouts) AS l(layout_key text, course_key text, course_name text, layout_name text,
    difficulty_mu float8, difficulty_sigma float8, sample_size int, player_count int, status text,
    effective_player_count float8, skill_range float8, recent_round_count int, layout_mapping text)
  ON CONFLICT (model_version, layout_key) DO UPDATE SET difficulty_mu=excluded.difficulty_mu, difficulty_sigma=excluded.difficulty_sigma,
    sample_size=excluded.sample_size, player_count=excluded.player_count, status=excluded.status,
    fitted_run_id=_run, fitted_at=now(), course_name=excluded.course_name, layout_name=excluded.layout_name,
    effective_player_count=excluded.effective_player_count, skill_range=excluded.skill_range,
    recent_round_count=excluded.recent_round_count, layout_mapping=excluded.layout_mapping;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Layouts not refitted in this run are stale for this model version.
  DELETE FROM dgd_layout_difficulty WHERE model_version=_model AND fitted_run_id IS DISTINCT FROM _run;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.dgd_v1_apply_player(_run uuid, _user uuid, _model text, _state jsonb, _events jsonb, _eligibility jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  UPDATE dgd_rating_events SET status='superseded', superseded_reason='replay:'||_run::text, superseded_at=now()
   WHERE user_id=_user AND model_version=_model AND status='active';

  INSERT INTO dgd_rating_events (user_id, canonical_round_id, model_version, calc_type, run_id, seq, played_on, source_refs,
    layout_key, layout_difficulty_mu, layout_difficulty_sigma, expected_score, actual_score, strokes_vs_expectation,
    round_performance_latent, round_performance_display, observation_sigma, days_since_last, mu_before, sigma_before,
    sigma_before_drifted, mu_after, sigma_after, display_before, display_after, confidence_before, confidence_after)
  SELECT _user, e.canonical_round_id, _model, 'round_update', _run, e.seq, e.played_on, coalesce(e.source_refs,'[]'::jsonb),
    e.layout_key, e.layout_difficulty_mu, e.layout_difficulty_sigma, e.expected_score, e.actual_score, e.strokes_vs_expectation,
    e.round_performance_latent, e.round_performance_display, e.observation_sigma, e.days_since_last, e.mu_before, e.sigma_before,
    e.sigma_before_drifted, e.mu_after, e.sigma_after, e.display_before, e.display_after, e.confidence_before, e.confidence_after
  FROM jsonb_to_recordset(_events) AS e(canonical_round_id uuid, seq int, played_on date, source_refs jsonb, layout_key text,
    layout_difficulty_mu float8, layout_difficulty_sigma float8, expected_score float8, actual_score int, strokes_vs_expectation float8,
    round_performance_latent float8, round_performance_display float8, observation_sigma float8, days_since_last int,
    mu_before float8, sigma_before float8, sigma_before_drifted float8, mu_after float8, sigma_after float8,
    display_before float8, display_after float8, confidence_before float8, confidence_after float8);
  GET DIAGNOSTICS n = ROW_COUNT;

  DELETE FROM dgd_round_eligibility WHERE user_id=_user AND model_version=_model
    AND canonical_round_id NOT IN (SELECT (x->>'canonical_round_id')::uuid FROM jsonb_array_elements(_eligibility) x);

  INSERT INTO dgd_round_eligibility (canonical_round_id, model_version, user_id, eligible, reasons, layout_key, checked_at, state, reason_codes)
  SELECT r.canonical_round_id, _model, _user, r.eligible, coalesce(r.reasons,'{}'), r.layout_key, now(), coalesce(r.state,'ELIGIBLE'), coalesce(r.reason_codes,'{}')
  FROM jsonb_to_recordset(_eligibility) AS r(canonical_round_id uuid, eligible boolean, reasons text[], layout_key text, state text, reason_codes text[])
  ON CONFLICT (canonical_round_id, model_version) DO UPDATE SET eligible=excluded.eligible, reasons=excluded.reasons,
    layout_key=excluded.layout_key, checked_at=now(), state=excluded.state, reason_codes=excluded.reason_codes;

  INSERT INTO dgd_player_state (user_id, model_version, skill_mu, skill_sigma, display_rating, form, confidence,
    effective_observations, eligible_rounds, ineligible_rounds, last_played_on, status, input_hash, last_run_id, updated_at)
  VALUES (_user, _model, (_state->>'skill_mu')::float8, (_state->>'skill_sigma')::float8, (_state->>'display_rating')::float8,
    (_state->>'form')::float8, (_state->>'confidence')::float8, (_state->>'effective_observations')::float8,
    (_state->>'eligible_rounds')::int, (_state->>'ineligible_rounds')::int, (_state->>'last_played_on')::date,
    _state->>'status', _state->>'input_hash', _run, now())
  ON CONFLICT (user_id, model_version) DO UPDATE SET skill_mu=excluded.skill_mu, skill_sigma=excluded.skill_sigma,
    display_rating=excluded.display_rating, form=excluded.form, confidence=excluded.confidence,
    effective_observations=excluded.effective_observations, eligible_rounds=excluded.eligible_rounds,
    ineligible_rounds=excluded.ineligible_rounds, last_played_on=excluded.last_played_on, status=excluded.status,
    input_hash=excluded.input_hash, last_run_id=excluded.last_run_id, updated_at=now();
  RETURN n;
END $function$;

-- Link a duplicate canonical round's sources into the surviving round. Sources are never deleted.
CREATE OR REPLACE FUNCTION public.dgd_v1_link_duplicate(_from uuid, _to uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer; u1 uuid; u2 uuid;
BEGIN
  SELECT user_id INTO u1 FROM canonical_rounds WHERE id=_from;
  SELECT user_id INTO u2 FROM canonical_rounds WHERE id=_to;
  IF u1 IS NULL OR u2 IS NULL OR u1 <> u2 OR _from = _to THEN RAISE EXCEPTION 'invalid link'; END IF;
  UPDATE canonical_round_sources SET canonical_round_id=_to, match_level='high' WHERE canonical_round_id=_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE canonical_rounds SET source_count=(SELECT count(*) FROM canonical_round_sources WHERE canonical_round_id=_to), updated_at=now() WHERE id=_to;
  DELETE FROM canonical_rounds WHERE id=_from AND NOT EXISTS (SELECT 1 FROM canonical_round_sources WHERE canonical_round_id=_from);
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.dgd_v1_apply_layouts(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dgd_v1_apply_player(uuid,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dgd_v1_link_duplicate(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v1_apply_layouts(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dgd_v1_apply_player(uuid,uuid,text,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dgd_v1_link_duplicate(uuid,uuid) TO service_role;