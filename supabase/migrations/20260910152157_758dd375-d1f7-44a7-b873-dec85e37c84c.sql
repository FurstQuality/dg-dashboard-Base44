ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_side_game_check;

ALTER TABLE public.rounds RENAME COLUMN side_game_config TO scoring_config;

UPDATE public.rounds
   SET scoring_type = side_game
 WHERE side_game IN ('wolf', 'imposter');

ALTER TABLE public.rounds DROP COLUMN IF EXISTS side_game;

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_scoring_type_check;

ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_scoring_type_check
  CHECK (scoring_type IN ('stroke_play','match_play','skins','points','wolf','imposter'));