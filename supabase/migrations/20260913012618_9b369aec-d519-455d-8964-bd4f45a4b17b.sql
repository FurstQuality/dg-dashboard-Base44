ALTER TABLE public.udisc_catalog
  ADD COLUMN IF NOT EXISTS us_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS udisc_catalog_sweep_order_idx
  ON public.udisc_catalog (status, us_score DESC, slug);