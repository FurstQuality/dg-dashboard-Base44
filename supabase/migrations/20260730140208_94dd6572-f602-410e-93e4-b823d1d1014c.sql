CREATE TABLE IF NOT EXISTS public.disc_market_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'infinite_discs',
  week_of date NOT NULL,
  rank integer NOT NULL,
  name text NOT NULL,
  brand text,
  plastic text,
  image_url text,
  product_url text NOT NULL,
  rating numeric,
  review_count integer,
  speed numeric,
  glide numeric,
  turn numeric,
  fade numeric,
  description text,
  mold_id uuid REFERENCES public.disc_molds(id) ON DELETE SET NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, week_of, rank)
);

CREATE INDEX IF NOT EXISTS disc_market_trends_week_idx ON public.disc_market_trends (week_of DESC, rank);

GRANT SELECT ON public.disc_market_trends TO authenticated;
GRANT ALL ON public.disc_market_trends TO service_role;

ALTER TABLE public.disc_market_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read disc market trends"
  ON public.disc_market_trends FOR SELECT
  TO authenticated
  USING (true);