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
           to_jsonb(e) AS payload,
           CASE COALESCE(e.source,'manual') WHEN 'pdga' THEN 0 WHEN 'udisc' THEN 1 ELSE 2 END AS prio
      FROM external_rounds e WHERE e.user_id = _user AND e.played_on IS NOT NULL
    UNION ALL
    SELECT 'round_ratings', rr.id, 'app', (r.started_at AT TIME ZONE 'UTC')::date, c.name, r.course_id, r.layout_id, NULL,
           rr.total_strokes, rr.round_rating, COALESCE(r.play_format,'singles'),
           CASE WHEN COALESCE(r.play_format,'singles') <> 'singles' THEN 'ineligible'
                WHEN r.is_rated = false THEN 'practice' ELSE 'rated' END,
           to_jsonb(rr), 1
      FROM round_ratings rr JOIN rounds r ON r.id = rr.round_id
      LEFT JOIN courses c ON c.id = r.course_id
     WHERE rr.user_id = _user AND r.status = 'completed'
    ORDER BY 4, 14, 2
  LOOP
    v_seen := v_seen + 1;

    INSERT INTO source_round_records (user_id, source, source_table, source_row_id, payload, payload_hash)
    VALUES (_user, rec.source, rec.tbl, rec.row_id, rec.payload, md5(rec.payload::text))
    ON CONFLICT DO NOTHING;

    -- Level 1 (certain): this exact source row is already linked.
    IF EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.source_table = rec.tbl AND s.source_row_id = rec.row_id) THEN
      CONTINUE;
    END IF;

    v_round := NULL; v_level := NULL;
    -- Level 2 (high): same day + same score from a different source, and either
    -- the course matches or one side is PDGA (PDGA lists the event, not the course).
    IF rec.score IS NOT NULL THEN
      SELECT cr.id INTO v_round FROM canonical_rounds cr
       WHERE cr.user_id = _user AND cr.played_on = rec.played_on AND cr.score = rec.score
         AND NOT EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.canonical_round_id = cr.id AND s.source = rec.source)
         AND (cr.course_key = public.normalize_course_name(COALESCE(rec.course_name,''))
              OR rec.source = 'pdga'
              OR EXISTS (SELECT 1 FROM canonical_round_sources s WHERE s.canonical_round_id = cr.id AND s.source = 'pdga'))
       ORDER BY cr.created_at
       LIMIT 1;
      IF v_round IS NOT NULL THEN v_level := 'high'; END IF;
    END IF;

    IF v_round IS NULL THEN
      INSERT INTO canonical_rounds (user_id, played_on, course_name, course_key, course_id, layout_id, layout_name,
                                    score, format, eligibility, primary_source)
      VALUES (_user, rec.played_on, rec.course_name, public.normalize_course_name(COALESCE(rec.course_name,'')),
              rec.course_id, rec.layout_id, rec.layout_name, rec.score, rec.format, rec.elig, rec.source)
      RETURNING id INTO v_round;
      v_created := v_created + 1;
      v_level := 'origin';

      -- Level 3 (possible): same day + score already exists — flag, never merge.
      IF rec.score IS NOT NULL AND EXISTS (
        SELECT 1 FROM canonical_rounds cr WHERE cr.user_id = _user AND cr.id <> v_round
          AND cr.played_on = rec.played_on AND cr.score = rec.score) THEN
        UPDATE canonical_rounds SET has_possible_duplicate = true, updated_at = now()
         WHERE user_id = _user AND played_on = rec.played_on AND score = rec.score;
        v_possible := v_possible + 1;
      END IF;
    ELSE
      -- Prefer a real course name over a PDGA event name.
      UPDATE canonical_rounds SET source_count = source_count + 1,
        course_name = CASE WHEN primary_source = 'pdga' AND rec.course_name IS NOT NULL THEN rec.course_name ELSE course_name END,
        course_key = CASE WHEN primary_source = 'pdga' AND rec.course_name IS NOT NULL
                          THEN public.normalize_course_name(rec.course_name) ELSE course_key END,
        layout_name = COALESCE(layout_name, rec.layout_name),
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
REVOKE ALL ON FUNCTION public.canonicalize_user_rounds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_user_rounds(uuid) TO service_role;