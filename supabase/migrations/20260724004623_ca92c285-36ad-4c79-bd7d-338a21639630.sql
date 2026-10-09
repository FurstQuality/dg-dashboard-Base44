
-- Add per-division schedule tracking so pool-split events (e.g. Ledgestone Open)
-- correctly map each division/pool to its round-specific course + layout.
ALTER TABLE public.tracker_event_rounds
  ADD COLUMN IF NOT EXISTS division text;

-- Drop the round-only uniqueness so we can store one row per (event, round, division).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracker_event_rounds_event_id_round_number_key'
      AND conrelid = 'public.tracker_event_rounds'::regclass
  ) THEN
    ALTER TABLE public.tracker_event_rounds
      DROP CONSTRAINT tracker_event_rounds_event_id_round_number_key;
  END IF;
END $$;

-- Unique on (event, round, division). Coalesce nulls so the "aggregate" row per
-- round (division = null) remains unique alongside per-division rows.
CREATE UNIQUE INDEX IF NOT EXISTS tracker_event_rounds_event_round_div_key
  ON public.tracker_event_rounds (event_id, round_number, COALESCE(division, ''));
