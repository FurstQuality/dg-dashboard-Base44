-- ===== Security tightening =====
DROP POLICY IF EXISTS "Signed-in players can read live scores" ON public.live_event_scores;
CREATE POLICY "Signed-in players read scores of synced events" ON public.live_event_scores FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.live_sync_registry r WHERE r.event_ref = live_event_scores.event_ref));

DROP POLICY IF EXISTS "Signed-in players can read the live sync schedule" ON public.live_sync_registry;
CREATE POLICY "Signed-in players read active sync schedule" ON public.live_sync_registry FOR SELECT TO authenticated
USING (active = true OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Signed-in players can read shot answers" ON public.dgp_shot_answers;
CREATE POLICY "Signed-in players read answers of published shot profiles" ON public.dgp_shot_answers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.dgp_shot_profiles p WHERE p.id = dgp_shot_answers.profile_id));

-- ===== Phase 2: canonical performance data =====
CREATE TABLE public.player_external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('pdga','udisc','scene')),
  external_id text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id),
  UNIQUE (user_id, source)
);
GRANT SELECT ON public.player_external_identities TO authenticated;
GRANT ALL ON public.player_external_identities TO service_role;
ALTER TABLE public.player_external_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own identities" ON public.player_external_identities FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.source_round_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_table text NOT NULL,
  source_row_id uuid NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_row_id, payload_hash)
);
GRANT SELECT ON public.source_round_records TO authenticated;
GRANT ALL ON public.source_round_records TO service_role;
ALTER TABLE public.source_round_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own source records" ON public.source_round_records FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX source_round_records_user_idx ON public.source_round_records (user_id, captured_at DESC);

CREATE TABLE public.canonical_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  played_on date NOT NULL,
  course_name text,
  course_key text,
  course_id uuid,
  layout_id uuid,
  layout_name text,
  score integer,
  format text NOT NULL DEFAULT 'singles',
  eligibility text NOT NULL DEFAULT 'rated' CHECK (eligibility IN ('rated','practice','ineligible')),
  primary_source text NOT NULL,
  source_count integer NOT NULL DEFAULT 1,
  has_possible_duplicate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.canonical_rounds TO authenticated;
GRANT ALL ON public.canonical_rounds TO service_role;
ALTER TABLE public.canonical_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own canonical rounds" ON public.canonical_rounds FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX canonical_rounds_user_date_idx ON public.canonical_rounds (user_id, played_on DESC);
CREATE INDEX canonical_rounds_match_idx ON public.canonical_rounds (user_id, played_on, score, course_key);

CREATE TABLE public.canonical_round_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_round_id uuid NOT NULL REFERENCES public.canonical_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_table text NOT NULL,
  source_row_id uuid NOT NULL,
  match_level text NOT NULL CHECK (match_level IN ('origin','certain','high','possible')),
  source_round_rating integer,
  source_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_row_id)
);
GRANT SELECT ON public.canonical_round_sources TO authenticated;
GRANT ALL ON public.canonical_round_sources TO service_role;
ALTER TABLE public.canonical_round_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own round links" ON public.canonical_round_sources FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX canonical_round_sources_round_idx ON public.canonical_round_sources (canonical_round_id);
CREATE INDEX canonical_round_sources_user_idx ON public.canonical_round_sources (user_id);

CREATE TABLE public.round_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'canonicalize',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  rows_seen integer NOT NULL DEFAULT 0,
  rounds_created integer NOT NULL DEFAULT 0,
  rows_linked integer NOT NULL DEFAULT 0,
  possible_duplicates integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.round_import_jobs TO authenticated;
GRANT ALL ON public.round_import_jobs TO service_role;
ALTER TABLE public.round_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own import jobs" ON public.round_import_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX round_import_jobs_user_idx ON public.round_import_jobs (user_id, started_at DESC);

-- Repeatable, idempotent canonicalization. Never modifies source rows.
CREATE OR REPLACE FUNCTION public.canonicalize_user_rounds(_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job uuid;
  rec record;
  v_round uuid;
  v_level text;
  v_seen int := 0; v_created int := 0; v_linked int := 0; v_possible int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  INSERT INTO round_import_jobs (user_id) VALUES (_user) RETURNING id INTO v_job;

  FOR rec IN
    SELECT 'external_rounds'::text AS tbl, e.id AS row_id, COALESCE(e.source,'manual') AS source,
           e.played_on, e.course_name, NULL::uuid AS course_id, NULL::uuid AS layout_id, e.layout_name,
           e.score, e.round_rating, COALESCE(e.format,'singles') AS format,
           CASE WHEN COALESCE(e.format,'singles') <> 'singles' OR e.included = false THEN 'ineligible' ELSE 'rated' END AS elig,
           to_jsonb(e) AS payload
      FROM external_rounds e WHERE e.user_id = _user AND e.played_on IS NOT NULL
    UNION ALL
    SELECT 'round_ratings', rr.id, 'app', (r.started_at AT TIME ZONE 'UTC')::date, c.name, r.course_id, r.layout_id, NULL,
           rr.total_strokes, rr.round_rating, COALESCE(r.play_format,'singles'),
           CASE WHEN COALESCE(r.play_format,'singles') <> 'singles' THEN 'ineligible'
                WHEN r.is_rated = false THEN 'practice' ELSE 'rated' END,
           to_jsonb(rr)
      FROM round_ratings rr JOIN rounds r ON r.id = rr.round_id
      LEFT JOIN courses c ON c.id = r.course_id
     WHERE rr.user_id = _user AND r.status = 'completed'
    ORDER BY 4, 2
  LOOP
    v_seen := v_seen + 1;

    INSERT INTO source_round_records (user_id, source, source_table, source_row_id, payload, payload_hash)
    VALUES (_user, rec.source, rec.tbl, rec.row_id, rec.payload, md5(rec.payload::text))
    ON CONFLICT DO NOTHING;

    -- Level 1: this exact source row is already linked.
    IF EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.source_table = rec.tbl AND s.source_row_id = rec.row_id) THEN
      CONTINUE;
    END IF;

    v_round := NULL; v_level := NULL;
    -- Level 2: same day, same score, same course, from a different source.
    SELECT cr.id INTO v_round FROM canonical_rounds cr
     WHERE cr.user_id = _user AND cr.played_on = rec.played_on AND cr.score IS NOT DISTINCT FROM rec.score
       AND rec.score IS NOT NULL
       AND cr.course_key = public.normalize_course_name(COALESCE(rec.course_name,''))
       AND NOT EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.canonical_round_id = cr.id AND s.source = rec.source)
     LIMIT 1;
    IF v_round IS NOT NULL THEN v_level := 'high'; END IF;

    IF v_round IS NULL THEN
      INSERT INTO canonical_rounds (user_id, played_on, course_name, course_key, course_id, layout_id, layout_name,
                                    score, format, eligibility, primary_source)
      VALUES (_user, rec.played_on, rec.course_name, public.normalize_course_name(COALESCE(rec.course_name,'')),
              rec.course_id, rec.layout_id, rec.layout_name, rec.score, rec.format, rec.elig, rec.source)
      RETURNING id INTO v_round;
      v_created := v_created + 1;
      v_level := 'origin';

      -- Level 3: same day + score on a different course — flag, never merge.
      IF rec.score IS NOT NULL AND EXISTS (
        SELECT 1 FROM canonical_rounds cr WHERE cr.user_id = _user AND cr.id <> v_round
          AND cr.played_on = rec.played_on AND cr.score = rec.score) THEN
        UPDATE canonical_rounds SET has_possible_duplicate = true, updated_at = now()
         WHERE user_id = _user AND played_on = rec.played_on AND score = rec.score;
        v_possible := v_possible + 1;
      END IF;
    ELSE
      UPDATE canonical_rounds SET source_count = source_count + 1,
        primary_source = CASE WHEN rec.source = 'pdga' THEN 'pdga' ELSE primary_source END,
        course_id = COALESCE(course_id, rec.course_id), layout_id = COALESCE(layout_id, rec.layout_id),
        updated_at = now()
       WHERE id = v_round;
    END IF;

    INSERT INTO canonical_round_sources (canonical_round_id, user_id, source, source_table, source_row_id,
                                         match_level, source_round_rating, source_score)
    VALUES (v_round, _user, rec.source, rec.tbl, rec.row_id, v_level, rec.round_rating, rec.score);
    v_linked := v_linked + 1;
  END LOOP;

  UPDATE round_import_jobs SET status = 'succeeded', finished_at = now(), rows_seen = v_seen,
    rounds_created = v_created, rows_linked = v_linked, possible_duplicates = v_possible
   WHERE id = v_job;

  RETURN jsonb_build_object('job', v_job, 'seen', v_seen, 'created', v_created, 'linked', v_linked, 'possible', v_possible);
EXCEPTION WHEN OTHERS THEN
  UPDATE round_import_jobs SET status = 'failed', finished_at = now(), error = left(SQLERRM, 300) WHERE id = v_job;
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.canonicalize_user_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canonicalize_user_rounds(uuid) TO authenticated, service_role;