ALTER TABLE public.external_rounds
  ADD COLUMN IF NOT EXISTS place integer,
  ADD COLUMN IF NOT EXISTS field_size integer,
  ADD COLUMN IF NOT EXISTS points numeric(8,2);

CREATE INDEX IF NOT EXISTS external_rounds_user_place_idx
  ON public.external_rounds (user_id, place)
  WHERE place IS NOT NULL;