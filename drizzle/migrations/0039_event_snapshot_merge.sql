CREATE OR REPLACE FUNCTION public.build_event_round_snapshot(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_event uuid; v_layout uuid; v_ver uuid; v_course uuid; v_snap jsonb; v_rules jsonb;
BEGIN
  IF _kind = 'tournament' THEN
    SELECT tournament_id, layout_id, layout_version_id, course_id INTO v_event, v_layout, v_ver, v_course FROM tournament_rounds WHERE id = _id;
  ELSIF _kind = 'league' THEN
    SELECT league_id, layout_id, layout_version_id, course_id INTO v_event, v_layout, v_ver, v_course FROM league_events WHERE id = _id;
  ELSE RAISE EXCEPTION 'Unknown event kind'; END IF;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event round not found'; END IF;
  IF NOT public.can_manage_event(_kind, v_event, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v_ver IS NULL AND v_layout IS NOT NULL THEN v_ver := public.latest_layout_version(v_layout); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'type',f.type,'hole_number',f.hole_number,'hole_numbers',f.hole_numbers,
           'geometry',f.geometry,'ob_side',f.ob_side,'label',f.label,'notes',f.notes)), '[]'::jsonb)
    INTO v_rules
    FROM course_features f JOIN course_event_overlays o ON o.id = f.event_overlay_id
   WHERE f.layer = 'event'
     AND ((_kind='tournament' AND o.tournament_id = v_event) OR (_kind='league' AND o.league_event_id = _id));

  v_snap := jsonb_build_object(
    'captured_at', now(), 'course_id', v_course, 'layout_id', v_layout, 'layout_version_id', v_ver,
    'layout_version', (SELECT version FROM layout_versions WHERE id = v_ver),
    'layout', (SELECT snapshot FROM layout_versions WHERE id = v_ver),
    'event_rules', v_rules);

  -- Merge so director notes already stored on the snapshot (e.g. scorecard_message) survive.
  IF _kind = 'tournament' THEN
    UPDATE tournament_rounds SET rules_snapshot = COALESCE(rules_snapshot,'{}'::jsonb) || v_snap, layout_version_id = v_ver WHERE id = _id;
  ELSE
    UPDATE league_events SET rules_snapshot = COALESCE(rules_snapshot,'{}'::jsonb) || v_snap, layout_version_id = v_ver WHERE id = _id;
  END IF;
  RETURN v_snap;
END $$;