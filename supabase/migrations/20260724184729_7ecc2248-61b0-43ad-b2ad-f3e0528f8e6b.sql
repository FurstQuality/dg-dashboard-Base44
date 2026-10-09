
-- 1) Ratings update schedule (authoritative source of PDGA update dates)
CREATE TABLE IF NOT EXISTS public.rating_update_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_date date NOT NULL UNIQUE,
  report_deadline date,
  authority text NOT NULL DEFAULT 'pdga',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rating_update_schedule TO authenticated;
GRANT ALL ON public.rating_update_schedule TO service_role;

ALTER TABLE public.rating_update_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can read ratings schedule" ON public.rating_update_schedule;
CREATE POLICY "Anyone signed in can read ratings schedule"
  ON public.rating_update_schedule FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage ratings schedule" ON public.rating_update_schedule;
CREATE POLICY "Admins manage ratings schedule"
  ON public.rating_update_schedule FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_rating_update_schedule_updated ON public.rating_update_schedule;
CREATE TRIGGER trg_rating_update_schedule_updated
  BEFORE UPDATE ON public.rating_update_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed published PDGA 2026 update dates (2nd Tuesday of each month; report deadline = prior Sunday).
INSERT INTO public.rating_update_schedule (update_date, report_deadline, authority, notes) VALUES
  ('2026-01-13', '2026-01-11', 'pdga', 'January 2026 PDGA rating update'),
  ('2026-02-10', '2026-02-08', 'pdga', 'February 2026 PDGA rating update'),
  ('2026-03-10', '2026-03-08', 'pdga', 'March 2026 PDGA rating update'),
  ('2026-04-14', '2026-04-12', 'pdga', 'April 2026 PDGA rating update'),
  ('2026-05-12', '2026-05-10', 'pdga', 'May 2026 PDGA rating update'),
  ('2026-06-09', '2026-06-07', 'pdga', 'June 2026 PDGA rating update'),
  ('2026-07-14', '2026-07-12', 'pdga', 'July 2026 PDGA rating update'),
  ('2026-08-11', '2026-08-09', 'pdga', 'August 2026 PDGA rating update'),
  ('2026-09-08', '2026-09-06', 'pdga', 'September 2026 PDGA rating update'),
  ('2026-10-13', '2026-10-11', 'pdga', 'October 2026 PDGA rating update'),
  ('2026-11-10', '2026-11-08', 'pdga', 'November 2026 PDGA rating update'),
  ('2026-12-08', '2026-12-06', 'pdga', 'December 2026 PDGA rating update')
ON CONFLICT (update_date) DO NOTHING;

-- 2) Remove the hidden "ceiling bonus" from compute_chainlink_round.
-- The SQL function's stroke-based version doesn't include a bonus, but we
-- re-declare it explicitly so the intent is auditable and future edits
-- can't reintroduce a hidden uplift without review. Peak capability is a
-- separate metric surfaced only in the UI.
CREATE OR REPLACE FUNCTION public.compute_chainlink_round(
  _score numeric,
  _ssa numeric,
  _stroke_value numeric DEFAULT 10,
  _base_rating integer DEFAULT NULL
) RETURNS integer
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO 'public'
AS $$
DECLARE
  diff numeric;
  sv numeric := COALESCE(_stroke_value, 10);
  base_rating integer;
BEGIN
  IF _score IS NULL OR _ssa IS NULL THEN
    RETURN _base_rating;
  END IF;
  diff := _score - _ssa;
  base_rating := COALESCE(_base_rating, ROUND(1000 - diff * sv)::int);
  -- No ceiling bonus. Peak-capability metrics are computed and displayed
  -- separately so the primary rating number stays reproducible.
  RETURN base_rating;
END;
$$;
