ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS tee_source text,
  ADD COLUMN IF NOT EXISTS tee_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS basket_source text,
  ADD COLUMN IF NOT EXISTS basket_accuracy_m double precision;
ALTER TABLE public.hole_tees ADD COLUMN IF NOT EXISTS source text, ADD COLUMN IF NOT EXISTS accuracy_m double precision;
ALTER TABLE public.hole_baskets ADD COLUMN IF NOT EXISTS source text, ADD COLUMN IF NOT EXISTS accuracy_m double precision;
COMMENT ON COLUMN public.holes.tee_source IS 'How the main tee was placed: aerial_map | gps | import | unknown';
COMMENT ON COLUMN public.holes.basket_source IS 'How the main basket was placed: aerial_map | gps | import | unknown';