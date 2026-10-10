-- Layout holes mirror the course's physical tee pads / basket spots.
-- Moving a tee or basket in the map editor moves the physical spot, and every layout using it follows.

CREATE OR REPLACE FUNCTION public.push_hole_spot_to_course()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; v_course uuid; v_shared boolean; v_steward boolean; v_new uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  SELECT sl.*, l.course_id AS cid INTO s
  FROM layout_slots sl JOIN course_layouts l ON l.id = sl.layout_id
  WHERE sl.legacy_hole_id = NEW.id LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;
  v_course := s.cid;
  IF NOT (public.can_edit_layout(s.layout_id, auth.uid()) OR auth.role() = 'service_role') THEN
    RETURN NEW;
  END IF;
  v_steward := public.can_steward_course(v_course, auth.uid()) OR auth.role() = 'service_role';

  -- Tee pad
  IF NEW.tee_lat IS NOT NULL AND NEW.tee_lng IS NOT NULL
     AND (NEW.tee_lat IS DISTINCT FROM OLD.tee_lat OR NEW.tee_lng IS DISTINCT FROM OLD.tee_lng) THEN
    IF s.tee_id IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM layout_slots x WHERE x.tee_id = s.tee_id AND x.layout_id <> s.layout_id) INTO v_shared;
      IF v_steward OR NOT v_shared THEN
        UPDATE course_tees SET latitude = NEW.tee_lat, longitude = NEW.tee_lng WHERE id = s.tee_id;
      ELSE
        INSERT INTO course_tees (course_id, course_hole_id, name, color, latitude, longitude, created_by, source)
        SELECT course_id, course_hole_id, name || ' (alt)', color, NEW.tee_lat, NEW.tee_lng, auth.uid(), 'manual'
        FROM course_tees WHERE id = s.tee_id RETURNING id INTO v_new;
        UPDATE layout_slots SET tee_id = v_new WHERE id = s.id;
      END IF;
    ELSE
      INSERT INTO course_tees (course_id, course_hole_id, name, color, latitude, longitude, created_by, source)
      VALUES (v_course, s.course_hole_id, COALESCE(NEW.tee_name, 'Main'), NEW.tee_color, NEW.tee_lat, NEW.tee_lng, auth.uid(), 'manual')
      RETURNING id INTO v_new;
      UPDATE layout_slots SET tee_id = v_new WHERE id = s.id;
    END IF;
  END IF;

  -- Basket spot
  IF NEW.basket_lat IS NOT NULL AND NEW.basket_lng IS NOT NULL
     AND (NEW.basket_lat IS DISTINCT FROM OLD.basket_lat OR NEW.basket_lng IS DISTINCT FROM OLD.basket_lng) THEN
    IF s.basket_id IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM layout_slots x WHERE x.basket_id = s.basket_id AND x.layout_id <> s.layout_id) INTO v_shared;
      IF v_steward OR NOT v_shared THEN
        UPDATE course_baskets SET latitude = NEW.basket_lat, longitude = NEW.basket_lng WHERE id = s.basket_id;
      ELSE
        INSERT INTO course_baskets (course_id, course_hole_id, name, latitude, longitude, created_by, source)
        SELECT course_id, course_hole_id, name || ' (alt)', NEW.basket_lat, NEW.basket_lng, auth.uid(), 'manual'
        FROM course_baskets WHERE id = s.basket_id RETURNING id INTO v_new;
        UPDATE layout_slots SET basket_id = v_new WHERE id = s.id;
      END IF;
    ELSE
      INSERT INTO course_baskets (course_id, course_hole_id, name, latitude, longitude, created_by, source)
      VALUES (v_course, s.course_hole_id, COALESCE(NEW.basket_name, 'A'), NEW.basket_lat, NEW.basket_lng, auth.uid(), 'manual')
      RETURNING id INTO v_new;
      UPDATE layout_slots SET basket_id = v_new WHERE id = s.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_push_hole_spot_to_course ON public.holes;
CREATE TRIGGER trg_push_hole_spot_to_course
AFTER UPDATE OF tee_lat, tee_lng, basket_lat, basket_lng ON public.holes
FOR EACH ROW EXECUTE FUNCTION public.push_hole_spot_to_course();

CREATE OR REPLACE FUNCTION public.pull_course_tee_to_holes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.latitude IS NOT DISTINCT FROM OLD.latitude AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude THEN RETURN NEW; END IF;
  UPDATE holes h SET tee_lat = NEW.latitude, tee_lng = NEW.longitude
  FROM layout_slots s WHERE s.tee_id = NEW.id AND s.legacy_hole_id = h.id
    AND (h.tee_lat IS DISTINCT FROM NEW.latitude OR h.tee_lng IS DISTINCT FROM NEW.longitude);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.pull_course_basket_to_holes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.latitude IS NOT DISTINCT FROM OLD.latitude AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude THEN RETURN NEW; END IF;
  UPDATE holes h SET basket_lat = NEW.latitude, basket_lng = NEW.longitude
  FROM layout_slots s WHERE s.basket_id = NEW.id AND s.legacy_hole_id = h.id
    AND (h.basket_lat IS DISTINCT FROM NEW.latitude OR h.basket_lng IS DISTINCT FROM NEW.longitude);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pull_course_tee_to_holes ON public.course_tees;
CREATE TRIGGER trg_pull_course_tee_to_holes AFTER UPDATE OF latitude, longitude ON public.course_tees
FOR EACH ROW EXECUTE FUNCTION public.pull_course_tee_to_holes();

DROP TRIGGER IF EXISTS trg_pull_course_basket_to_holes ON public.course_baskets;
CREATE TRIGGER trg_pull_course_basket_to_holes AFTER UPDATE OF latitude, longitude ON public.course_baskets
FOR EACH ROW EXECUTE FUNCTION public.pull_course_basket_to_holes();

REVOKE EXECUTE ON FUNCTION public.push_hole_spot_to_course() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pull_course_tee_to_holes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pull_course_basket_to_holes() FROM PUBLIC, anon, authenticated;