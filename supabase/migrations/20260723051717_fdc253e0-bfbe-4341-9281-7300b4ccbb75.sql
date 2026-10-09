
CREATE TABLE IF NOT EXISTS public.pdga_tour_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_event_id text UNIQUE,
  name text NOT NULL,
  url text,
  start_date date,
  end_date date,
  tier text,
  sanctioning text,
  city text,
  state text,
  country text,
  location text,
  registration_url text,
  registration_status text,
  source text NOT NULL DEFAULT 'pdga',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdga_tour_events_start_idx ON public.pdga_tour_events (start_date);
CREATE INDEX IF NOT EXISTS pdga_tour_events_country_state_idx ON public.pdga_tour_events (country, state);

GRANT SELECT ON public.pdga_tour_events TO anon, authenticated;
GRANT ALL ON public.pdga_tour_events TO service_role;

ALTER TABLE public.pdga_tour_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view pdga tour events" ON public.pdga_tour_events;
CREATE POLICY "Anyone can view pdga tour events" ON public.pdga_tour_events FOR SELECT USING (true);
