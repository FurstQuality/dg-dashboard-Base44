
-- pdga_players: public cache of profile lookups
CREATE TABLE public.pdga_players (
  pdga_number text PRIMARY KEY,
  name text,
  location text,
  classification text,
  current_rating integer,
  rounds_used integer,
  std_dev numeric,
  drop_below integer,
  last_changed date,
  next_update date,
  raw jsonb DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pdga_players TO anon, authenticated;
GRANT ALL ON public.pdga_players TO service_role;
ALTER TABLE public.pdga_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PDGA players are public" ON public.pdga_players FOR SELECT USING (true);

-- pdga_events: public cache of event history rows
CREATE TABLE public.pdga_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL REFERENCES public.pdga_players(pdga_number) ON DELETE CASCADE,
  event_ref text,
  event_name text NOT NULL,
  tier text,
  event_date date,
  division text,
  place integer,
  field_size integer,
  points numeric,
  prize_cents integer,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pdga_number, event_name, event_date, division)
);
CREATE INDEX pdga_events_pdga_idx ON public.pdga_events(pdga_number, event_date DESC);
GRANT SELECT ON public.pdga_events TO anon, authenticated;
GRANT ALL ON public.pdga_events TO service_role;
ALTER TABLE public.pdga_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PDGA events are public" ON public.pdga_events FOR SELECT USING (true);

-- link external_rounds rows to an event
ALTER TABLE public.external_rounds ADD COLUMN IF NOT EXISTS pdga_event_ref text;

-- rating_plans: user's own projection plans
CREATE TABLE public.rating_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdga_number text,
  name text NOT NULL,
  strategy text NOT NULL CHECK (strategy IN ('offset','goal','manual')),
  target_rating integer,
  offset_points integer DEFAULT 0,
  months integer NOT NULL DEFAULT 6,
  rounds_per_month integer NOT NULL DEFAULT 4,
  color text DEFAULT '#22d3ee',
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rating_plans_user_idx ON public.rating_plans(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rating_plans TO authenticated;
GRANT ALL ON public.rating_plans TO service_role;
ALTER TABLE public.rating_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rating plans" ON public.rating_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- rating_plan_events
CREATE TABLE public.rating_plan_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.rating_plans(id) ON DELETE CASCADE,
  event_name text,
  event_date date NOT NULL,
  rounds integer NOT NULL DEFAULT 2,
  expected_rating integer,
  actual_rating integer,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rating_plan_events_plan_idx ON public.rating_plan_events(plan_id, event_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rating_plan_events TO authenticated;
GRANT ALL ON public.rating_plan_events TO service_role;
ALTER TABLE public.rating_plan_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage events of own plans" ON public.rating_plan_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.rating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));

CREATE TRIGGER rating_plans_touch BEFORE UPDATE ON public.rating_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pdga_players_touch BEFORE UPDATE ON public.pdga_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
