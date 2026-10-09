ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS team_throw_style text,
  ADD COLUMN IF NOT EXISTS scoring_type text NOT NULL DEFAULT 'stroke_play',
  ADD COLUMN IF NOT EXISTS team_size integer,
  ADD COLUMN IF NOT EXISTS use_handicap boolean NOT NULL DEFAULT false;

UPDATE public.rounds
   SET team_throw_style = CASE play_format
         WHEN 'best_shot' THEN 'best_throw'
         WHEN 'worst_shot' THEN 'worst_throw'
       END,
       play_format = 'doubles',
       team_size = COALESCE(team_size, 2)
 WHERE play_format IN ('best_shot', 'worst_shot');