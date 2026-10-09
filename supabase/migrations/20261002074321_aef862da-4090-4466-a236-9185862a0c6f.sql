-- Security: dgp catalogs read server-side only
DROP POLICY IF EXISTS "Signed-in players can read skill groups" ON public.dgp_skill_groups;
DROP POLICY IF EXISTS "Signed-in players can read shot profiles" ON public.dgp_shot_profiles;

-- Security: hole-media reads bound to referenced or own files
DROP POLICY IF EXISTS hole_media_read ON storage.objects;
CREATE POLICY hole_media_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'hole-media' AND (
    owner = auth.uid()
    OR EXISTS (SELECT 1 FROM public.hole_media hm WHERE hm.storage_path = storage.objects.name)
    OR EXISTS (SELECT 1 FROM public.holes h WHERE h.map_snapshot_path = storage.objects.name)
    OR EXISTS (SELECT 1 FROM public.courses c WHERE c.overview_snapshot_path = storage.objects.name)
  )
);

CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'super_admin')
$$;

-- DGD V1 (shadow)
CREATE TABLE public.rating_model_versions (
  id text PRIMARY KEY,
  model_name text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow','preview','active','retired')),
  config jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rating_model_versions TO authenticated;
GRANT ALL ON public.rating_model_versions TO service_role;
ALTER TABLE public.rating_model_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read model versions" ON public.rating_model_versions FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_calc_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL REFERENCES public.rating_model_versions(id),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  triggered_by uuid,
  players_seen integer NOT NULL DEFAULT 0,
  players_skipped integer NOT NULL DEFAULT 0,
  events_written integer NOT NULL DEFAULT 0,
  layouts_fitted integer NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]',
  validation jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.dgd_calc_runs TO authenticated;
GRANT ALL ON public.dgd_calc_runs TO service_role;
ALTER TABLE public.dgd_calc_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read calc runs" ON public.dgd_calc_runs FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_layout_difficulty (
  model_version text NOT NULL REFERENCES public.rating_model_versions(id),
  layout_key text NOT NULL,
  course_key text,
  course_name text,
  layout_name text,
  difficulty_mu double precision NOT NULL,
  difficulty_sigma double precision NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  player_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('unrated','provisional','established')),
  fitted_run_id uuid REFERENCES public.dgd_calc_runs(id),
  fitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model_version, layout_key)
);
GRANT SELECT ON public.dgd_layout_difficulty TO authenticated;
GRANT ALL ON public.dgd_layout_difficulty TO service_role;
ALTER TABLE public.dgd_layout_difficulty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read layout difficulty" ON public.dgd_layout_difficulty FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_round_eligibility (
  canonical_round_id uuid NOT NULL REFERENCES public.canonical_rounds(id) ON DELETE CASCADE,
  model_version text NOT NULL REFERENCES public.rating_model_versions(id),
  user_id uuid NOT NULL,
  eligible boolean NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  layout_key text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_round_id, model_version)
);
GRANT SELECT ON public.dgd_round_eligibility TO authenticated;
GRANT ALL ON public.dgd_round_eligibility TO service_role;
ALTER TABLE public.dgd_round_eligibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read round eligibility" ON public.dgd_round_eligibility FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE INDEX dgd_round_eligibility_user_idx ON public.dgd_round_eligibility (user_id, model_version);

CREATE TABLE public.dgd_rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  canonical_round_id uuid NOT NULL,
  model_version text NOT NULL REFERENCES public.rating_model_versions(id),
  calc_type text NOT NULL DEFAULT 'round_update',
  run_id uuid REFERENCES public.dgd_calc_runs(id),
  seq integer NOT NULL,
  played_on date NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]',
  layout_key text NOT NULL,
  layout_difficulty_mu double precision NOT NULL,
  layout_difficulty_sigma double precision NOT NULL,
  expected_score double precision NOT NULL,
  actual_score integer NOT NULL,
  strokes_vs_expectation double precision NOT NULL,
  round_performance_latent double precision NOT NULL,
  round_performance_display double precision NOT NULL,
  observation_sigma double precision NOT NULL,
  days_since_last integer,
  mu_before double precision NOT NULL,
  sigma_before double precision NOT NULL,
  sigma_before_drifted double precision NOT NULL,
  mu_after double precision NOT NULL,
  sigma_after double precision NOT NULL,
  display_before double precision NOT NULL,
  display_after double precision NOT NULL,
  confidence_before double precision NOT NULL,
  confidence_after double precision NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','invalidated')),
  superseded_reason text,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dgd_rating_events TO authenticated;
GRANT ALL ON public.dgd_rating_events TO service_role;
ALTER TABLE public.dgd_rating_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read rating events" ON public.dgd_rating_events FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE UNIQUE INDEX dgd_rating_events_active_uniq ON public.dgd_rating_events (user_id, canonical_round_id, model_version, calc_type) WHERE status = 'active';
CREATE INDEX dgd_rating_events_user_idx ON public.dgd_rating_events (user_id, model_version, seq);
CREATE INDEX dgd_rating_events_round_idx ON public.dgd_rating_events (canonical_round_id);

CREATE TABLE public.dgd_player_state (
  user_id uuid NOT NULL,
  model_version text NOT NULL REFERENCES public.rating_model_versions(id),
  skill_mu double precision NOT NULL,
  skill_sigma double precision NOT NULL,
  display_rating double precision NOT NULL,
  form double precision,
  confidence double precision NOT NULL,
  effective_observations double precision NOT NULL DEFAULT 0,
  eligible_rounds integer NOT NULL DEFAULT 0,
  ineligible_rounds integer NOT NULL DEFAULT 0,
  last_played_on date,
  status text NOT NULL CHECK (status IN ('no_data','provisional','established')),
  input_hash text NOT NULL,
  last_run_id uuid REFERENCES public.dgd_calc_runs(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, model_version)
);
GRANT SELECT ON public.dgd_player_state TO authenticated;
GRANT ALL ON public.dgd_player_state TO service_role;
ALTER TABLE public.dgd_player_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read player state" ON public.dgd_player_state FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Atomic per-player replay write. Supersedes prior active events, never deletes.
CREATE OR REPLACE FUNCTION public.dgd_v1_apply_player(_run uuid, _user uuid, _model text, _state jsonb, _events jsonb, _eligibility jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO dgd_round_eligibility (canonical_round_id, model_version, user_id, eligible, reasons, layout_key, checked_at)
  SELECT r.canonical_round_id, _model, _user, r.eligible, coalesce(r.reasons,'{}'), r.layout_key, now()
  FROM jsonb_to_recordset(_eligibility) AS r(canonical_round_id uuid, eligible boolean, reasons text[], layout_key text)
  ON CONFLICT (canonical_round_id, model_version) DO UPDATE SET eligible=excluded.eligible, reasons=excluded.reasons,
    layout_key=excluded.layout_key, checked_at=now();

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
END $$;

CREATE OR REPLACE FUNCTION public.dgd_v1_apply_layouts(_run uuid, _model text, _layouts jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO dgd_layout_difficulty (model_version, layout_key, course_key, course_name, layout_name, difficulty_mu,
    difficulty_sigma, sample_size, player_count, status, fitted_run_id, fitted_at)
  SELECT _model, l.layout_key, l.course_key, l.course_name, l.layout_name, l.difficulty_mu, l.difficulty_sigma,
    l.sample_size, l.player_count, l.status, _run, now()
  FROM jsonb_to_recordset(_layouts) AS l(layout_key text, course_key text, course_name text, layout_name text,
    difficulty_mu float8, difficulty_sigma float8, sample_size int, player_count int, status text)
  ON CONFLICT (model_version, layout_key) DO UPDATE SET difficulty_mu=excluded.difficulty_mu, difficulty_sigma=excluded.difficulty_sigma,
    sample_size=excluded.sample_size, player_count=excluded.player_count, status=excluded.status,
    fitted_run_id=_run, fitted_at=now(), course_name=excluded.course_name, layout_name=excluded.layout_name;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.dgd_v1_apply_player(uuid,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dgd_v1_apply_layouts(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v1_apply_player(uuid,uuid,text,jsonb,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dgd_v1_apply_layouts(uuid,text,jsonb) TO service_role;

INSERT INTO public.rating_model_versions (id, model_name, version, status, config, notes) VALUES (
  'dgd-core-v1@1.0.0', 'DGD Core V1', '1.0.0', 'shadow',
  '{
    "population_prior_mu": 0,
    "population_prior_sigma": 8,
    "skill_drift_per_day": 0.02,
    "skill_sigma_floor": 0.75,
    "base_observation_sigma": 3.0,
    "observation_sigma_min": 2.0,
    "observation_sigma_max": 12.0,
    "unknown_hole_count_sigma_mult": 1.15,
    "minimum_supported_holes": 9,
    "plausible_score_min": 18,
    "plausible_score_max": 130,
    "plausible_to_par_min": -30,
    "plausible_to_par_max": 60,
    "layout_prior_sigma": 6,
    "layout_shrink_rounds": 3,
    "layout_minimum_sample": 3,
    "layout_established_sample": 10,
    "layout_convergence_threshold": 0.01,
    "layout_max_iterations": 200,
    "player_fit_shrink_rounds": 2,
    "form_half_life_days": 30,
    "form_min_effective_observations": 2,
    "form_max_lookback_days": 365,
    "display_scale_center": 50,
    "display_scale_factor": 2.5,
    "display_min": 0,
    "display_max": 100,
    "confidence_reference_sigma": 8,
    "established_max_sigma": 2.5
  }'::jsonb,
  'Shadow model. Skill in strokes better than a population-average player on the same layout. Display transform provisional.'
);