-- Phase 5A: source-agnostic V1.1 shadow pipeline (jobs, freshness, coverage).
ALTER TABLE public.dgd_v11_player_state ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE public.dgd_v11_player_state
  ADD COLUMN IF NOT EXISTS rating_status text NOT NULL DEFAULT 'UNRATED',
  ADD COLUMN IF NOT EXISTS source_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS state_hash text,
  ADD COLUMN IF NOT EXISTS input_basis text NOT NULL DEFAULT 'calibration';
ALTER TABLE public.dgd_v11_player_state ADD CONSTRAINT dgd_v11_player_state_rating_status_check
  CHECK (rating_status IN ('UNRATED','PROVISIONAL','ESTABLISHED'));

ALTER TABLE public.dgd_v11_round_results ALTER COLUMN calibration_round_id DROP NOT NULL;
ALTER TABLE public.dgd_v11_round_results
  ADD COLUMN IF NOT EXISTS canonical_round_id uuid,
  ADD COLUMN IF NOT EXISTS sources text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin_source text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS course_name text,
  ADD COLUMN IF NOT EXISTS legacy_round_rating integer,
  ADD COLUMN IF NOT EXISTS row_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS dgd_v11_round_results_canonical_key
  ON public.dgd_v11_round_results (user_id, canonical_round_id, model_version) WHERE canonical_round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dgd_v11_round_results_user_source ON public.dgd_v11_round_results (user_id, origin_source);

-- Job queue
CREATE TABLE public.dgd_v11_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  model_version text NOT NULL DEFAULT 'dgd-core-v1.1-candidate@0.1.0',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','retry_pending','failed')),
  reasons text[] NOT NULL DEFAULT '{}',
  earliest_affected_on date,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  mode text,
  replay_from date,
  rows_changed integer,
  duration_ms integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dgd_v11_jobs_open_key ON public.dgd_v11_jobs (user_id, model_version) WHERE status IN ('queued','retry_pending');
CREATE INDEX dgd_v11_jobs_status_idx ON public.dgd_v11_jobs (status, run_after);
CREATE INDEX dgd_v11_jobs_user_idx ON public.dgd_v11_jobs (user_id, created_at DESC);
GRANT SELECT ON public.dgd_v11_jobs TO authenticated;
GRANT ALL ON public.dgd_v11_jobs TO service_role;
ALTER TABLE public.dgd_v11_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v11 jobs" ON public.dgd_v11_jobs FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Freshness
CREATE TABLE public.dgd_v11_freshness (
  user_id uuid PRIMARY KEY,
  model_version text NOT NULL DEFAULT 'dgd-core-v1.1-candidate@0.1.0',
  last_calculated_at timestamptz,
  latest_eligible_round_at date,
  latest_source_change_at timestamptz,
  recalculation_pending boolean NOT NULL DEFAULT false,
  last_job_status text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dgd_v11_freshness TO authenticated;
GRANT ALL ON public.dgd_v11_freshness TO service_role;
ALTER TABLE public.dgd_v11_freshness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v11 freshness" ON public.dgd_v11_freshness FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Worker token (never granted to API roles)
CREATE TABLE public.dgd_v11_worker_secret (id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'));
REVOKE ALL ON public.dgd_v11_worker_secret FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.dgd_v11_worker_secret ENABLE ROW LEVEL SECURITY;
INSERT INTO public.dgd_v11_worker_secret (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.dgd_v11_worker_token_ok(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.dgd_v11_worker_secret WHERE id = 1 AND token = _token AND length(_token) = 64)
$$;
REVOKE ALL ON FUNCTION public.dgd_v11_worker_token_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v11_worker_token_ok(text) TO service_role;

-- Enqueue (merges into one open job per player; keeps the earliest affected date)
CREATE OR REPLACE FUNCTION public.dgd_v11_enqueue(_user uuid, _reason text, _from date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  INSERT INTO public.dgd_v11_jobs (user_id, reasons, earliest_affected_on)
  VALUES (_user, ARRAY[_reason], _from)
  ON CONFLICT (user_id, model_version) WHERE status IN ('queued','retry_pending')
  DO UPDATE SET
    reasons = ARRAY(SELECT DISTINCT x FROM unnest(public.dgd_v11_jobs.reasons || EXCLUDED.reasons) x),
    earliest_affected_on = CASE
      WHEN public.dgd_v11_jobs.earliest_affected_on IS NULL OR EXCLUDED.earliest_affected_on IS NULL THEN NULL
      ELSE LEAST(public.dgd_v11_jobs.earliest_affected_on, EXCLUDED.earliest_affected_on) END,
    updated_at = now();
  INSERT INTO public.dgd_v11_freshness (user_id, latest_source_change_at, recalculation_pending)
  VALUES (_user, now(), true)
  ON CONFLICT (user_id) DO UPDATE SET latest_source_change_at = now(), recalculation_pending = true, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.dgd_v11_enqueue(uuid, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v11_enqueue(uuid, text, date) TO service_role;

-- Claim jobs (reclaims stuck work first); skip-locked so parallel workers never double-process
CREATE OR REPLACE FUNCTION public.dgd_v11_claim_jobs(_limit integer)
RETURNS SETOF public.dgd_v11_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.dgd_v11_jobs j SET status = 'retry_pending', last_error = 'Worker timed out', updated_at = now()
   WHERE j.status = 'processing' AND j.started_at < now() - interval '10 minutes'
     AND NOT EXISTS (SELECT 1 FROM public.dgd_v11_jobs o WHERE o.user_id = j.user_id AND o.model_version = j.model_version AND o.status IN ('queued','retry_pending'));
  UPDATE public.dgd_v11_jobs SET status = 'failed', finished_at = now(), updated_at = now()
   WHERE status = 'processing' AND started_at < now() - interval '10 minutes';
  RETURN QUERY
  UPDATE public.dgd_v11_jobs SET status = 'processing', attempts = attempts + 1, started_at = now(), updated_at = now()
   WHERE id IN (
     SELECT id FROM public.dgd_v11_jobs
      WHERE status IN ('queued','retry_pending') AND run_after <= now()
      ORDER BY created_at LIMIT LEAST(GREATEST(_limit, 1), 100)
      FOR UPDATE SKIP LOCKED)
  RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.dgd_v11_claim_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dgd_v11_claim_jobs(integer) TO service_role;

-- Evidence-change triggers
CREATE OR REPLACE FUNCTION public.dgd_v11_on_canonical_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.dgd_v11_enqueue(OLD.user_id, 'canonical_removed', OLD.played_on);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.dgd_v11_enqueue(NEW.user_id, 'canonical_added', NEW.played_on);
  ELSE
    PERFORM public.dgd_v11_enqueue(NEW.user_id, 'canonical_corrected', LEAST(OLD.played_on, NEW.played_on));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER dgd_v11_canonical_change AFTER INSERT OR DELETE ON public.canonical_rounds
  FOR EACH ROW EXECUTE FUNCTION public.dgd_v11_on_canonical_change();
CREATE TRIGGER dgd_v11_canonical_update AFTER UPDATE ON public.canonical_rounds
  FOR EACH ROW WHEN ((OLD.played_on, OLD.score, OLD.course_key, OLD.layout_id, OLD.layout_name, OLD.format, OLD.eligibility, OLD.has_possible_duplicate, OLD.source_count)
                IS DISTINCT FROM (NEW.played_on, NEW.score, NEW.course_key, NEW.layout_id, NEW.layout_name, NEW.format, NEW.eligibility, NEW.has_possible_duplicate, NEW.source_count))
  EXECUTE FUNCTION public.dgd_v11_on_canonical_change();

CREATE OR REPLACE FUNCTION public.dgd_v11_on_round_evidence_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; d date;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT played_on INTO d FROM public.canonical_rounds WHERE id = r.canonical_round_id;
  PERFORM public.dgd_v11_enqueue(r.user_id, TG_ARGV[0], d);
  RETURN NULL;
END $$;
CREATE TRIGGER dgd_v11_source_change AFTER INSERT OR UPDATE OR DELETE ON public.canonical_round_sources
  FOR EACH ROW EXECUTE FUNCTION public.dgd_v11_on_round_evidence_change('source_link_changed');
CREATE TRIGGER dgd_v11_duplicate_change AFTER INSERT OR UPDATE OR DELETE ON public.dgd_duplicate_reviews
  FOR EACH ROW EXECUTE FUNCTION public.dgd_v11_on_round_evidence_change('duplicate_resolution');
CREATE TRIGGER dgd_v11_normalization_change AFTER INSERT OR DELETE ON public.dgd_round_normalization
  FOR EACH ROW EXECUTE FUNCTION public.dgd_v11_on_round_evidence_change('layout_mapping');
CREATE TRIGGER dgd_v11_normalization_update AFTER UPDATE ON public.dgd_round_normalization
  FOR EACH ROW WHEN ((OLD.hole_count, OLD.to_par, OLD.par_played, OLD.layout_id, OLD.layout_mapping, OLD.data_issue)
                IS DISTINCT FROM (NEW.hole_count, NEW.to_par, NEW.par_played, NEW.layout_id, NEW.layout_mapping, NEW.data_issue))
  EXECUTE FUNCTION public.dgd_v11_on_round_evidence_change('layout_mapping');
REVOKE ALL ON FUNCTION public.dgd_v11_on_canonical_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dgd_v11_on_round_evidence_change() FROM PUBLIC, anon, authenticated;

-- Player summary now includes rating status and freshness (own row only, testers only)
CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'form_delta', round(s.form_delta, 1), 'form_rounds', s.form_rounds,
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
END $$;
REVOKE ALL ON FUNCTION public.get_my_dgd_preview_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_summary() TO authenticated;

-- Combined history with filters over canonical physical rounds
CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_rounds_v2(
  _limit integer DEFAULT 25, _offset integer DEFAULT 0, _status text DEFAULT NULL,
  _source text DEFAULT NULL, _rated boolean DEFAULT NULL, _category text DEFAULT NULL,
  _from date DEFAULT NULL, _to date DEFAULT NULL, _course text DEFAULT NULL)
RETURNS TABLE (id uuid, played_on date, event_name text, division text, round_number integer, layout_name text, course_name text, par integer,
  score integer, pdga_round_rating integer, legacy_round_rating integer, status text, status_reason text, layout_knowledge text,
  pre_expected numeric, pre_strokes_vs_expectation numeric, likely_low numeric, likely_high numeric,
  ctx_expected numeric, ctx_strokes_vs_expectation numeric, event_adjustment numeric,
  round_performance_display numeric, display_before numeric, display_after numeric, confidence_before numeric, confidence_after numeric,
  sources text[], category text, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.played_on, r.event_name, r.division, r.round_number, r.layout_name, r.course_name, r.par,
    r.score, r.pdga_round_rating, r.legacy_round_rating, r.status, r.status_reason, r.layout_knowledge,
    round(r.pre_expected, 1), round(r.pre_strokes_vs_expectation, 1), round(r.likely_low), round(r.likely_high),
    round(r.ctx_expected, 1), round(r.ctx_strokes_vs_expectation, 1), round(r.event_adjustment, 1),
    round(r.round_performance_display, 1), round(r.display_before, 1), round(r.display_after, 1),
    round(r.confidence_before), round(r.confidence_after), r.sources, r.category,
    count(*) OVER ()
  FROM public.dgd_v11_round_results r
  JOIN public.dgd_v11_player_state s ON s.user_id = r.user_id AND s.model_version = r.model_version
  WHERE public.dgd_preview_allowed() AND r.user_id = auth.uid()
    AND (_status IS NULL OR r.status = _status)
    AND (_source IS NULL OR _source = ANY (r.sources))
    AND (_rated IS NULL OR (r.status IN ('rated','provisional')) = _rated)
    AND (_category IS NULL OR r.category = _category)
    AND (_from IS NULL OR r.played_on >= _from)
    AND (_to IS NULL OR r.played_on <= _to)
    AND (_course IS NULL OR COALESCE(r.course_name, r.layout_name, '') ILIKE '%' || replace(replace(_course, '%', ''), '_', '') || '%')
  ORDER BY r.played_on DESC, r.seq DESC
  LIMIT LEAST(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0)
$$;
REVOKE ALL ON FUNCTION public.get_my_dgd_preview_rounds_v2(integer, integer, text, text, boolean, text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_rounds_v2(integer, integer, text, text, boolean, text, date, date, text) TO authenticated;

COMMENT ON COLUMN public.dgd_v11_round_results.calibration_round_id IS 'Phase 4 calibration-cohort rows only; Phase 5A rows use canonical_round_id';
COMMENT ON FUNCTION public.get_my_dgd_preview_rounds(integer, integer, text) IS 'DEPRECATED: replaced by get_my_dgd_preview_rounds_v2';