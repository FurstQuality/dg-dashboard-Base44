
-- =========================================
-- COURSE INTEL
-- =========================================
CREATE TABLE public.course_intel (
  course_key text PRIMARY KEY,
  course_id uuid,
  course_name text,
  rounds_count int NOT NULL DEFAULT 0,
  pdga_rounds_count int NOT NULL DEFAULT 0,
  udisc_rounds_count int NOT NULL DEFAULT 0,
  avg_ssa numeric,
  avg_stroke_value numeric,
  avg_round_rating numeric,
  avg_to_par numeric,
  best_round_rating int,
  hardest_score int,
  easiest_score int,
  last_played_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.course_intel TO authenticated;
GRANT ALL ON public.course_intel TO service_role;
ALTER TABLE public.course_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "course_intel readable by authenticated"
  ON public.course_intel FOR SELECT TO authenticated USING (true);

CREATE INDEX course_intel_name_idx ON public.course_intel (course_name);
CREATE INDEX course_intel_course_id_idx ON public.course_intel (course_id) WHERE course_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_course_intel(_course_id uuid, _course_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text := public.normalize_course_name(_course_name);
  key text;
BEGIN
  IF _course_id IS NULL AND (norm IS NULL OR norm = '') THEN RETURN; END IF;
  key := CASE WHEN _course_id IS NOT NULL THEN 'id:'||_course_id::text ELSE norm END;

  INSERT INTO public.course_intel AS ci (
    course_key, course_id, course_name,
    rounds_count, pdga_rounds_count, udisc_rounds_count,
    avg_ssa, avg_stroke_value, avg_round_rating, avg_to_par,
    best_round_rating, hardest_score, easiest_score, last_played_on, updated_at
  )
  SELECT
    key,
    _course_id,
    COALESCE(_course_name, MAX(er.course_name)),
    COUNT(*),
    COUNT(*) FILTER (WHERE er.source = 'pdga'),
    COUNT(*) FILTER (WHERE er.source = 'udisc'),
    AVG(er.ssa)::numeric,
    AVG(CASE WHEN (er.score - er.ssa) <> 0 AND er.round_rating IS NOT NULL AND er.ssa IS NOT NULL
             THEN (1000 - er.round_rating)::numeric / (er.score - er.ssa) END),
    AVG(er.round_rating)::numeric,
    AVG(er.to_par)::numeric,
    MAX(er.round_rating),
    MAX(er.score),
    MIN(er.score),
    MAX(er.played_on),
    now()
  FROM public.external_rounds er
  WHERE er.format = 'singles'
    AND norm <> '' AND public.normalize_course_name(er.course_name) = norm
  HAVING COUNT(*) > 0
  ON CONFLICT (course_key) DO UPDATE SET
    course_id = COALESCE(EXCLUDED.course_id, ci.course_id),
    course_name = COALESCE(EXCLUDED.course_name, ci.course_name),
    rounds_count = EXCLUDED.rounds_count,
    pdga_rounds_count = EXCLUDED.pdga_rounds_count,
    udisc_rounds_count = EXCLUDED.udisc_rounds_count,
    avg_ssa = EXCLUDED.avg_ssa,
    avg_stroke_value = EXCLUDED.avg_stroke_value,
    avg_round_rating = EXCLUDED.avg_round_rating,
    avg_to_par = EXCLUDED.avg_to_par,
    best_round_rating = EXCLUDED.best_round_rating,
    hardest_score = EXCLUDED.hardest_score,
    easiest_score = EXCLUDED.easiest_score,
    last_played_on = EXCLUDED.last_played_on,
    updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_course_intel_ext()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_course_intel(NULL, NEW.course_name);
  IF TG_OP = 'UPDATE' AND public.normalize_course_name(OLD.course_name) IS DISTINCT FROM public.normalize_course_name(NEW.course_name) THEN
    PERFORM public.refresh_course_intel(NULL, OLD.course_name);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS refresh_course_intel_ext ON public.external_rounds;
CREATE TRIGGER refresh_course_intel_ext
  AFTER INSERT OR UPDATE OF course_name, score, ssa, round_rating, to_par, played_on, format, source
  ON public.external_rounds
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_course_intel_ext();

-- Backfill course_intel from every known course in external_rounds
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT MAX(er.course_name) AS course_name
      FROM public.external_rounds er
     WHERE er.format = 'singles' AND er.course_name IS NOT NULL
     GROUP BY public.normalize_course_name(er.course_name)
  LOOP
    PERFORM public.refresh_course_intel(NULL, r.course_name);
  END LOOP;
END $$;

-- =========================================
-- HOLE INTEL
-- =========================================
CREATE TABLE public.hole_intel (
  layout_id uuid NOT NULL,
  hole_number int NOT NULL,
  par int,
  scores_count int NOT NULL DEFAULT 0,
  avg_strokes numeric,
  ace_count int NOT NULL DEFAULT 0,
  eagle_count int NOT NULL DEFAULT 0,
  birdie_count int NOT NULL DEFAULT 0,
  par_count int NOT NULL DEFAULT 0,
  bogey_count int NOT NULL DEFAULT 0,
  double_plus_count int NOT NULL DEFAULT 0,
  c1_putts_made int NOT NULL DEFAULT 0,
  c1_putts_missed int NOT NULL DEFAULT 0,
  c2_putts_made int NOT NULL DEFAULT 0,
  c2_putts_missed int NOT NULL DEFAULT 0,
  throw_in_count int NOT NULL DEFAULT 0,
  longest_throw_ft int,
  ob_strokes_total int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (layout_id, hole_number)
);
GRANT SELECT ON public.hole_intel TO authenticated;
GRANT ALL ON public.hole_intel TO service_role;
ALTER TABLE public.hole_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hole_intel readable by authenticated"
  ON public.hole_intel FOR SELECT TO authenticated USING (true);

CREATE INDEX hole_intel_layout_idx ON public.hole_intel (layout_id);

CREATE OR REPLACE FUNCTION public.refresh_hole_intel(_layout_id uuid, _hole_number int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hp int;
BEGIN
  IF _layout_id IS NULL OR _hole_number IS NULL THEN RETURN; END IF;
  SELECT par INTO hp FROM public.holes
   WHERE layout_id = _layout_id AND number = _hole_number LIMIT 1;

  INSERT INTO public.hole_intel AS hi (
    layout_id, hole_number, par, scores_count, avg_strokes,
    ace_count, eagle_count, birdie_count, par_count, bogey_count, double_plus_count,
    c1_putts_made, c1_putts_missed, c2_putts_made, c2_putts_missed,
    throw_in_count, longest_throw_ft, ob_strokes_total, updated_at
  )
  SELECT
    _layout_id, _hole_number, hp,
    COUNT(*),
    AVG(rs.strokes)::numeric,
    COUNT(*) FILTER (WHERE rs.strokes = 1),
    COUNT(*) FILTER (WHERE hp IS NOT NULL AND rs.strokes - hp <= -2 AND rs.strokes > 1),
    COUNT(*) FILTER (WHERE hp IS NOT NULL AND rs.strokes - hp = -1),
    COUNT(*) FILTER (WHERE hp IS NOT NULL AND rs.strokes - hp = 0),
    COUNT(*) FILTER (WHERE hp IS NOT NULL AND rs.strokes - hp = 1),
    COUNT(*) FILTER (WHERE hp IS NOT NULL AND rs.strokes - hp >= 2),
    COALESCE(SUM(rs.c1_putts_made), 0),
    COALESCE(SUM(rs.c1_putts_missed), 0),
    COALESCE(SUM(rs.c2_putts_made), 0),
    COALESCE(SUM(rs.c2_putts_missed), 0),
    COUNT(*) FILTER (WHERE rs.throw_in_ft IS NOT NULL AND rs.throw_in_ft > 0),
    MAX(rs.longest_throw_ft)::int,
    COALESCE(SUM(rs.ob_strokes), 0),
    now()
  FROM public.round_scores rs
  JOIN public.rounds r ON r.id = rs.round_id
  WHERE r.layout_id = _layout_id
    AND rs.hole_number = _hole_number
    AND rs.strokes > 0
  HAVING COUNT(*) > 0
  ON CONFLICT (layout_id, hole_number) DO UPDATE SET
    par = COALESCE(EXCLUDED.par, hi.par),
    scores_count = EXCLUDED.scores_count,
    avg_strokes = EXCLUDED.avg_strokes,
    ace_count = EXCLUDED.ace_count,
    eagle_count = EXCLUDED.eagle_count,
    birdie_count = EXCLUDED.birdie_count,
    par_count = EXCLUDED.par_count,
    bogey_count = EXCLUDED.bogey_count,
    double_plus_count = EXCLUDED.double_plus_count,
    c1_putts_made = EXCLUDED.c1_putts_made,
    c1_putts_missed = EXCLUDED.c1_putts_missed,
    c2_putts_made = EXCLUDED.c2_putts_made,
    c2_putts_missed = EXCLUDED.c2_putts_missed,
    throw_in_count = EXCLUDED.throw_in_count,
    longest_throw_ft = EXCLUDED.longest_throw_ft,
    ob_strokes_total = EXCLUDED.ob_strokes_total,
    updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.trg_refresh_hole_intel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lay uuid;
BEGIN
  SELECT layout_id INTO lay FROM public.rounds
   WHERE id = COALESCE(NEW.round_id, OLD.round_id) LIMIT 1;
  IF lay IS NOT NULL THEN
    PERFORM public.refresh_hole_intel(lay, COALESCE(NEW.hole_number, OLD.hole_number));
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS refresh_hole_intel_ins ON public.round_scores;
CREATE TRIGGER refresh_hole_intel_ins
  AFTER INSERT OR UPDATE OF strokes, c1_putts_made, c1_putts_missed, c2_putts_made, c2_putts_missed,
    throw_in_ft, longest_throw_ft, ob_strokes, hole_number
  ON public.round_scores
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_hole_intel();

-- Backfill hole_intel
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT rd.layout_id, rs.hole_number
      FROM public.round_scores rs
      JOIN public.rounds rd ON rd.id = rs.round_id
     WHERE rs.strokes > 0
  LOOP
    PERFORM public.refresh_hole_intel(r.layout_id, r.hole_number);
  END LOOP;
END $$;
