
ALTER TABLE public.round_scores
  ADD COLUMN IF NOT EXISTS c1_in_reg boolean,
  ADD COLUMN IF NOT EXISTS c2_in_reg boolean,
  ADD COLUMN IF NOT EXISTS drive_distance_ft integer,
  ADD COLUMN IF NOT EXISTS drive_disc_id uuid,
  ADD COLUMN IF NOT EXISTS putt_disc_id uuid,
  ADD COLUMN IF NOT EXISTS c1_putts_made smallint,
  ADD COLUMN IF NOT EXISTS c1_putts_missed smallint,
  ADD COLUMN IF NOT EXISTS c2_putts_made smallint,
  ADD COLUMN IF NOT EXISTS c2_putts_missed smallint,
  ADD COLUMN IF NOT EXISTS scramble boolean;
