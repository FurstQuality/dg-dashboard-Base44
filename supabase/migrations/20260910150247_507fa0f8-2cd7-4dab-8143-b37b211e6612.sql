ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS side_game text,
  ADD COLUMN IF NOT EXISTS side_game_config jsonb;

ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS rounds_side_game_check;

ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_side_game_check
  CHECK (side_game IS NULL OR side_game IN ('none','wolf','imposter'));