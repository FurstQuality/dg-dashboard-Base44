-- One course build: a tee→basket pairing has one fairway shape, whichever layout it was drawn in.
CREATE OR REPLACE FUNCTION public.share_hole_flight_path()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _course uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.flight_path IS NOT DISTINCT FROM OLD.flight_path OR NEW.tee_lat IS NULL OR NEW.basket_lat IS NULL THEN RETURN NEW; END IF;
  SELECT course_id INTO _course FROM course_layouts WHERE id = NEW.layout_id;
  UPDATE holes h SET flight_path = NEW.flight_path
  FROM course_layouts l
  WHERE l.id = h.layout_id AND l.course_id = _course AND h.id <> NEW.id
    AND abs(h.tee_lat - NEW.tee_lat) < 0.000015 AND abs(h.tee_lng - NEW.tee_lng) < 0.000015
    AND abs(h.basket_lat - NEW.basket_lat) < 0.000015 AND abs(h.basket_lng - NEW.basket_lng) < 0.000015;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_share_hole_flight_path ON public.holes;
CREATE TRIGGER trg_share_hole_flight_path AFTER UPDATE OF flight_path ON public.holes
  FOR EACH ROW EXECUTE FUNCTION public.share_hole_flight_path();