
-- 1. trust_level columns
ALTER TABLE public.external_rounds
  ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'manual'
    CHECK (trust_level IN ('verified','scraped','manual'));

ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS trust_level text NOT NULL DEFAULT 'manual'
    CHECK (trust_level IN ('verified','scraped','manual'));

-- 2. Backfill trust from source
UPDATE public.external_rounds
   SET trust_level = CASE
     WHEN source = 'pdga' THEN 'verified'
     WHEN source IN ('udisc','dgs','disc_golf_scene','scraped') THEN 'scraped'
     ELSE 'manual'
   END
 WHERE trust_level = 'manual';

UPDATE public.scheduled_events
   SET trust_level = CASE
     WHEN source::text = 'pdga' THEN 'verified'
     WHEN source::text IN ('udisc','dgs','disc_golf_scene') THEN 'scraped'
     ELSE 'manual'
   END
 WHERE trust_level = 'manual';

-- 3. Dedupe rounds: keep highest-trust row per (user, course, played, score, format)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, lower(course_name), played_on, coalesce(score,-9999), format
           ORDER BY
             CASE trust_level WHEN 'verified' THEN 0 WHEN 'scraped' THEN 1 ELSE 2 END,
             round_rating DESC NULLS LAST,
             updated_at DESC
         ) AS rn
    FROM public.external_rounds
)
DELETE FROM public.external_rounds er
 USING ranked r
 WHERE er.id = r.id AND r.rn > 1;

-- 4. Dedupe events: keep highest-trust row per (user, title, starts_on)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, lower(title), starts_on
           ORDER BY
             CASE trust_level WHEN 'verified' THEN 0 WHEN 'scraped' THEN 1 ELSE 2 END,
             last_synced_at DESC NULLS LAST,
             updated_at DESC
         ) AS rn
    FROM public.scheduled_events
)
DELETE FROM public.scheduled_events se
 USING ranked r
 WHERE se.id = r.id AND r.rn > 1;

-- 5. Reconciled data-health RPC
CREATE OR REPLACE FUNCTION public.get_my_data_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'rounds', jsonb_build_object(
      'total',    (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid()),
      'verified', (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid() AND trust_level = 'verified'),
      'scraped',  (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid() AND trust_level = 'scraped'),
      'manual',   (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid() AND trust_level = 'manual'),
      'needs_review', (SELECT count(*) FROM public.external_rounds
                        WHERE user_id = auth.uid()
                          AND (round_rating IS NULL OR score IS NULL))
    ),
    'events', jsonb_build_object(
      'total',    (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid()),
      'verified', (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid() AND trust_level = 'verified'),
      'scraped',  (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid() AND trust_level = 'scraped'),
      'manual',   (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid() AND trust_level = 'manual'),
      'upcoming', (SELECT count(*) FROM public.scheduled_events
                    WHERE user_id = auth.uid() AND starts_on >= current_date)
    ),
    'generated_at', now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_data_health() TO authenticated;

-- 6. Trust-level indexes for fast filtering
CREATE INDEX IF NOT EXISTS external_rounds_user_trust_idx
  ON public.external_rounds (user_id, trust_level);
CREATE INDEX IF NOT EXISTS scheduled_events_user_trust_idx
  ON public.scheduled_events (user_id, trust_level);
