CREATE OR REPLACE FUNCTION public.save_layout_slots(_layout uuid, _slots jsonb, _numbering text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid;
BEGIN
  IF NOT can_edit_layout(_layout, auth.uid()) THEN RAISE EXCEPTION 'Not allowed to edit this layout'; END IF;
  SELECT course_id INTO v_course FROM course_layouts WHERE id = _layout;
  -- every referenced asset must belong to this course
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_slots) e
    WHERE NOT EXISTS (SELECT 1 FROM course_holes h WHERE h.id = (e->>'course_hole_id')::uuid AND h.course_id = v_course)
       OR ((e->>'tee_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM course_tees t WHERE t.id = (e->>'tee_id')::uuid AND t.course_id = v_course))
       OR ((e->>'basket_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM course_baskets b WHERE b.id = (e->>'basket_id')::uuid AND b.course_id = v_course))
  ) THEN RAISE EXCEPTION 'Layout references holes, tees or baskets from another course'; END IF;

  CREATE TEMP TABLE _old ON COMMIT DROP AS SELECT id, legacy_hole_id FROM layout_slots WHERE layout_id = _layout;
  DELETE FROM layout_slots WHERE layout_id = _layout;
  INSERT INTO layout_slots (id, layout_id, position, display_label, course_hole_id, tee_id, basket_id, par, included, rules, legacy_hole_id)
  SELECT COALESCE((e->>'id')::uuid, gen_random_uuid()), _layout, (e->>'position')::int, e->>'display_label',
         (e->>'course_hole_id')::uuid, (e->>'tee_id')::uuid, (e->>'basket_id')::uuid, (e->>'par')::int,
         COALESCE((e->>'included')::boolean, true), COALESCE(e->'rules','[]'::jsonb),
         (SELECT o.legacy_hole_id FROM _old o WHERE o.id = (e->>'id')::uuid)
  FROM jsonb_array_elements(_slots) e;
  IF _numbering IN ('route','course') THEN UPDATE course_layouts SET numbering_mode = _numbering WHERE id = _layout; END IF;

  -- Legacy holes of excluded/removed slots leave the playable layout (kept if they hold media).
  DELETE FROM holes h WHERE h.layout_id = _layout
    AND NOT EXISTS (SELECT 1 FROM layout_slots s WHERE s.legacy_hole_id = h.id AND s.included)
    AND NOT EXISTS (SELECT 1 FROM hole_media m WHERE m.hole_id = h.id);
  UPDATE layout_slots SET legacy_hole_id = NULL WHERE layout_id = _layout AND NOT included;
  PERFORM sync_layout_legacy_holes(_layout);
END $$;
REVOKE ALL ON FUNCTION public.save_layout_slots(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_layout_slots(uuid, jsonb, text) TO authenticated;
