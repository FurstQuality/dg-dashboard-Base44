-- Prepared locally; audit deployed definitions and test in authorized staging
-- before applying. No historical snapshot is backfilled or rewritten.
ALTER TABLE public.layout_versions ADD COLUMN IF NOT EXISTS context_snapshot jsonb;
COMMENT ON COLUMN public.layout_versions.context_snapshot IS
  'Versioned frozen source geometry and selected course features. NULL on older versions means not captured; never resolve it from current course data.';

CREATE OR REPLACE FUNCTION public.freeze_layout_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Published layout versions are immutable; publish a new version'
    USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION public.freeze_layout_version() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS freeze_layout_version_tr ON public.layout_versions;
CREATE TRIGGER freeze_layout_version_tr BEFORE UPDATE OR DELETE ON public.layout_versions
  FOR EACH ROW EXECUTE FUNCTION public.freeze_layout_version();

CREATE OR REPLACE FUNCTION public.publish_layout(_layout uuid, _summary text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_course uuid;
  v_next integer;
  v_count integer;
  v_invalid boolean;
  v_snap jsonb;
  v_context jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  -- Serialize publishers for this layout. Geometry is captured by one statement
  -- below, so validation and serialization see the same MVCC snapshot.
  SELECT l.course_id INTO v_course FROM public.course_layouts l WHERE l.id = _layout FOR UPDATE;
  IF v_course IS NULL THEN RAISE EXCEPTION 'Layout not found'; END IF;
  IF NOT COALESCE(public.can_steward_course(v_course, v_actor), false) THEN
    RAISE EXCEPTION 'Only course stewards can publish layouts';
  END IF;

  WITH resolved AS (
    SELECT s.*, t.name tn, t.latitude tl, t.longitude tg, b.name bn, b.latitude bl, b.longitude bg,
      (ch.id IS NULL OR ch.course_id <> v_course
       OR t.id IS NULL OR t.course_id <> v_course OR t.course_hole_id <> s.course_hole_id
       OR b.id IS NULL OR b.course_id <> v_course OR b.course_hole_id <> s.course_hole_id
       OR s.par IS NULL OR s.par NOT BETWEEN 2 AND 7 OR s.position < 1
       OR COALESCE(btrim(s.display_label), '') = ''
       OR ((t.latitude IS NULL) <> (t.longitude IS NULL))
       OR ((b.latitude IS NULL) <> (b.longitude IS NULL))
       OR (t.latitude IS NOT NULL AND NOT (t.latitude BETWEEN -90 AND 90 AND t.longitude BETWEEN -180 AND 180))
       OR (b.latitude IS NOT NULL AND NOT (b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180))
      ) invalid,
      CASE WHEN h.layout_id = _layout AND h.physical_hole_key = s.course_hole_id
        AND t.latitude IS NOT NULL AND b.latitude IS NOT NULL
        AND h.tee_lat = t.latitude AND h.tee_lng = t.longitude
        AND h.basket_lat = b.latitude AND h.basket_lng = b.longitude
        THEN h.id ELSE NULL END route_source_id,
      h.flight_path source_path
    FROM public.layout_slots s
    LEFT JOIN public.course_holes ch ON ch.id = s.course_hole_id
    LEFT JOIN public.course_tees t ON t.id = s.tee_id
    LEFT JOIN public.course_baskets b ON b.id = s.basket_id
    LEFT JOIN public.holes h ON h.id = s.legacy_hole_id
    WHERE s.layout_id = _layout AND s.included
  )
  SELECT count(*), COALESCE(bool_or(r.invalid), false),
    COALESCE(jsonb_agg(jsonb_build_object(
      'position', r.position, 'label', r.display_label, 'course_hole_id', r.course_hole_id,
      'tee_id', r.tee_id, 'tee_name', r.tn, 'tee', CASE WHEN r.tl IS NULL THEN NULL ELSE jsonb_build_array(r.tl, r.tg) END,
      'basket_id', r.basket_id, 'basket_name', r.bn, 'basket', CASE WHEN r.bl IS NULL THEN NULL ELSE jsonb_build_array(r.bl, r.bg) END,
      'par', r.par, 'rules', r.rules,
      'flight_path', CASE WHEN r.route_source_id IS NOT NULL THEN r.source_path ELSE r.flight_path END,
      'route_source_id', r.route_source_id,
      'route_geometry_status', CASE WHEN r.route_source_id IS NULL THEN 'unlinked' ELSE 'captured_source' END
    ) ORDER BY r.position), '[]'::jsonb),
    jsonb_build_object(
      'schema_version', 1, 'course_id', v_course, 'layout_id', _layout,
      'layout', (SELECT jsonb_build_object('name', l.name, 'numbering_mode', l.numbering_mode,
        'played_rule_ids', l.played_rule_ids) FROM public.course_layouts l WHERE l.id = _layout),
      'course_holes', (SELECT COALESCE(jsonb_agg(to_jsonb(ch) ORDER BY ch.id), '[]'::jsonb)
        FROM public.course_holes ch WHERE ch.id IN (SELECT course_hole_id FROM resolved)),
      'tees', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb)
        FROM public.course_tees t WHERE t.id IN (SELECT tee_id FROM resolved)),
      'baskets', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.id), '[]'::jsonb)
        FROM public.course_baskets b WHERE b.id IN (SELECT basket_id FROM resolved)),
      -- Preserve version-1 JSON, measured override metadata and interior node IDs
      -- exactly. Consumers use the strict Studio resolver; no spline is stored
      -- here and no captured source is presented as validated/measured geometry.
      'legacy_geometry', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'hole', to_jsonb(h),
        'tees', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_order, t.id), '[]'::jsonb)
          FROM public.hole_tees t WHERE t.hole_id = h.id),
        'baskets', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.sort_order, b.id), '[]'::jsonb)
          FROM public.hole_baskets b WHERE b.hole_id = h.id)
      ) ORDER BY h.id), '[]'::jsonb) FROM public.holes h WHERE h.id IN (SELECT route_source_id FROM resolved)),
      'features', (SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.id), '[]'::jsonb)
        FROM public.course_features f JOIN public.course_layouts l ON l.id = _layout
        WHERE f.course_id = v_course AND f.layer <> 'event'
          AND (f.type NOT IN ('ob_line','ob_area','ob_reference','mando','dropzone','hazard','island_green')
            OR (l.played_rule_ids IS NOT NULL AND f.id = ANY(l.played_rule_ids))
            OR (l.played_rule_ids IS NULL AND (f.layout_id IS NULL OR f.layout_id = _layout))))
    )
  INTO v_count, v_invalid, v_snap, v_context FROM resolved r;

  IF v_count = 0 THEN RAISE EXCEPTION 'Add at least one included hole before publishing'; END IF;
  IF v_invalid THEN
    RAISE EXCEPTION 'Every included hole needs a label, a par from 2 to 7, and tees/baskets belonging to its course hole; check coordinates too';
  END IF;
  SELECT COALESCE(max(v.version), 0) + 1 INTO v_next FROM public.layout_versions v WHERE v.layout_id = _layout;
  INSERT INTO public.layout_versions (layout_id, version, snapshot, context_snapshot, summary, published_by)
    VALUES (_layout, v_next, v_snap, v_context, _summary, v_actor);
  UPDATE public.course_layouts SET
    status = CASE WHEN status IN ('draft','retired','archived') THEN 'published' ELSE status END,
    current_version = v_next WHERE id = _layout;
  RETURN v_next;
END $$;
REVOKE ALL ON FUNCTION public.publish_layout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_layout(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.build_event_round_snapshot(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event uuid; v_layout uuid; v_ver uuid; v_course uuid; v_snap jsonb; v_rules jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _kind = 'tournament' THEN
    SELECT tournament_id, layout_id, layout_version_id, course_id INTO v_event, v_layout, v_ver, v_course
      FROM public.tournament_rounds WHERE id = _id FOR UPDATE;
  ELSIF _kind = 'league' THEN
    SELECT league_id, layout_id, layout_version_id, course_id INTO v_event, v_layout, v_ver, v_course
      FROM public.league_events WHERE id = _id FOR UPDATE;
  ELSE RAISE EXCEPTION 'Unknown event kind'; END IF;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event round not found'; END IF;
  IF NOT COALESCE(public.event_has_capability(_kind, v_event, auth.uid(), 'event.manage_course_ops'), false) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_ver IS NULL AND v_layout IS NOT NULL THEN v_ver := public.latest_layout_version(v_layout); END IF;
  IF v_layout IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.layout_versions v JOIN public.course_layouts l ON l.id = v.layout_id
    WHERE v.id = v_ver AND v.layout_id = v_layout AND l.course_id = v_course
  ) THEN RAISE EXCEPTION 'A published version of this course layout is required'; END IF;
  IF v_layout IS NULL AND v_ver IS NOT NULL THEN RAISE EXCEPTION 'Layout version has no layout'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'type', f.type, 'hole_number', f.hole_number,
    'hole_numbers', f.hole_numbers, 'geometry', f.geometry, 'ob_side', f.ob_side, 'label', f.label, 'notes', f.notes)
    ORDER BY f.id), '[]'::jsonb) INTO v_rules
  FROM public.course_features f JOIN public.course_event_overlays o ON o.id = f.event_overlay_id
  WHERE f.layer = 'event' AND f.course_id = v_course
    AND ((_kind = 'tournament' AND o.tournament_id = v_event) OR (_kind = 'league' AND o.league_event_id = _id));
  v_snap := jsonb_build_object(
    'captured_at', now(), 'course_id', v_course, 'layout_id', v_layout, 'layout_version_id', v_ver,
    'layout_version', (SELECT version FROM public.layout_versions WHERE id = v_ver),
    'layout', (SELECT snapshot FROM public.layout_versions WHERE id = v_ver),
    'layout_context', (SELECT context_snapshot FROM public.layout_versions WHERE id = v_ver),
    'event_rules', v_rules);
  IF _kind = 'tournament' THEN
    UPDATE public.tournament_rounds SET rules_snapshot = COALESCE(rules_snapshot, '{}'::jsonb) || v_snap,
      layout_version_id = v_ver WHERE id = _id;
  ELSE
    UPDATE public.league_events SET rules_snapshot = COALESCE(rules_snapshot, '{}'::jsonb) || v_snap,
      layout_version_id = v_ver WHERE id = _id;
  END IF;
  RETURN v_snap;
END $$;
REVOKE ALL ON FUNCTION public.build_event_round_snapshot(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_event_round_snapshot(text, uuid) TO authenticated;
