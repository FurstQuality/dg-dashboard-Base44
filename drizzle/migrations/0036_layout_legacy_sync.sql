-- Keeps legacy holes rows (read by scoring, rounds, tee signs) in step with layout_slots.
CREATE OR REPLACE FUNCTION public.sync_layout_legacy_holes(_layout uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_hole uuid;
BEGIN
  IF NOT can_edit_layout(_layout, auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Not allowed to edit this layout';
  END IF;
  FOR s IN
    SELECT sl.*, t.latitude tl, t.longitude tg, t.name tn, t.color tc, b.latitude bl, b.longitude bg, b.name bn
    FROM layout_slots sl LEFT JOIN course_tees t ON t.id = sl.tee_id LEFT JOIN course_baskets b ON b.id = sl.basket_id
    WHERE sl.layout_id = _layout AND sl.included ORDER BY sl.position
  LOOP
    IF s.legacy_hole_id IS NOT NULL AND EXISTS (SELECT 1 FROM holes WHERE id = s.legacy_hole_id) THEN
      UPDATE holes SET number = s.position + 1000, par = COALESCE(s.par, par), tee_lat = s.tl, tee_lng = s.tg,
        tee_name = s.tn, tee_color = s.tc, basket_lat = s.bl, basket_lng = s.bg, basket_name = s.bn,
        nickname = CASE WHEN s.display_label ~ '^[0-9]+$' THEN nickname ELSE s.display_label END,
        flight_path = COALESCE(s.flight_path, flight_path), physical_hole_key = s.course_hole_id
      WHERE id = s.legacy_hole_id;
    ELSE
      INSERT INTO holes (layout_id, number, par, tee_lat, tee_lng, tee_name, tee_color, basket_lat, basket_lng, basket_name, nickname, flight_path, physical_hole_key)
      VALUES (_layout, s.position + 1000, COALESCE(s.par, 3), s.tl, s.tg, s.tn, s.tc, s.bl, s.bg, s.bn,
        CASE WHEN s.display_label ~ '^[0-9]+$' THEN NULL ELSE s.display_label END, s.flight_path, s.course_hole_id)
      RETURNING id INTO v_hole;
      UPDATE layout_slots SET legacy_hole_id = v_hole WHERE id = s.id;
    END IF;
  END LOOP;
  -- Two-step renumber avoids unique (layout_id, number) collisions.
  UPDATE holes SET number = number - 1000 WHERE layout_id = _layout AND number > 1000;
  UPDATE course_layouts SET
    hole_count = (SELECT count(*) FROM layout_slots WHERE layout_id = _layout AND included),
    par_total = (SELECT sum(par) FROM layout_slots WHERE layout_id = _layout AND included)
  WHERE id = _layout;
END $$;
REVOKE ALL ON FUNCTION public.sync_layout_legacy_holes(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_layout_legacy_holes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.copy_layout(_source uuid, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid; v_new uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Layout name required'; END IF;
  SELECT course_id INTO v_course FROM course_layouts WHERE id = _source
    AND (status <> 'draft' OR can_edit_layout(_source, auth.uid()));
  IF v_course IS NULL THEN RAISE EXCEPTION 'Layout not found'; END IF;
  INSERT INTO course_layouts (course_id, name, created_by, status, copied_from_layout_id, numbering_mode, family, is_default)
  SELECT course_id, trim(_name), auth.uid(), 'draft', id, numbering_mode, family, false FROM course_layouts WHERE id = _source
  RETURNING id INTO v_new;
  INSERT INTO layout_slots (layout_id, position, display_label, course_hole_id, tee_id, basket_id, par, flight_path, rules, included)
  SELECT v_new, position, display_label, course_hole_id, tee_id, basket_id, par, flight_path, rules, included
  FROM layout_slots WHERE layout_id = _source;
  PERFORM sync_layout_legacy_holes(v_new);
  RETURN v_new;
END $$;
