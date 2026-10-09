-- ============ ingest_queue ============
CREATE TABLE public.ingest_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('pdga','disc_golf_scene','udisc','dgcr','internal')),
  kind text NOT NULL CHECK (kind IN ('course','event','player','directory','geocode')),
  target text NOT NULL,
  region text,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','dead','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, kind, target)
);

GRANT SELECT ON public.ingest_queue TO authenticated;
GRANT ALL ON public.ingest_queue TO service_role;
ALTER TABLE public.ingest_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read the ingest queue"
  ON public.ingest_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX ingest_queue_ready_idx ON public.ingest_queue (status, priority, next_run_at);
CREATE INDEX ingest_queue_region_idx ON public.ingest_queue (region, status);

-- ============ ingest_regions ============
CREATE TABLE public.ingest_regions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state_code text NOT NULL UNIQUE,
  country text NOT NULL DEFAULT 'US',
  ring integer NOT NULL DEFAULT 3,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT false,
  paused boolean NOT NULL DEFAULT false,
  courses_seen integer NOT NULL DEFAULT 0,
  events_seen integer NOT NULL DEFAULT 0,
  players_seen integer NOT NULL DEFAULT 0,
  last_directory_at timestamptz,
  last_promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingest_regions TO authenticated;
GRANT ALL ON public.ingest_regions TO service_role;
ALTER TABLE public.ingest_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read ingest regions"
  ON public.ingest_regions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));

-- ============ ingest_runs ============
CREATE TABLE public.ingest_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  claimed integer NOT NULL DEFAULT 0,
  succeeded integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  discovered integer NOT NULL DEFAULT 0,
  pages_used integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors text[] NOT NULL DEFAULT ARRAY[]::text[]
);

GRANT SELECT ON public.ingest_runs TO authenticated;
GRANT ALL ON public.ingest_runs TO service_role;
ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read ingest runs"
  ON public.ingest_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX ingest_runs_started_idx ON public.ingest_runs (started_at DESC);

-- ============ ingest_state ============
CREATE TABLE public.ingest_state (
  id text NOT NULL PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  lease_until timestamptz,
  lease_owner text,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  paused_at timestamptz,
  daily_page_budget integer NOT NULL DEFAULT 600,
  pages_used_today integer NOT NULL DEFAULT 0,
  budget_day date NOT NULL DEFAULT (now()::date),
  batch_size integer NOT NULL DEFAULT 12,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ingest_state TO authenticated;
GRANT ALL ON public.ingest_state TO service_role;
ALTER TABLE public.ingest_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read ingest state"
  ON public.ingest_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));

INSERT INTO public.ingest_state (id) VALUES ('singleton');

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ingest_queue_updated_at BEFORE UPDATE ON public.ingest_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ingest_regions_updated_at BEFORE UPDATE ON public.ingest_regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ingest_state_updated_at BEFORE UPDATE ON public.ingest_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Seed regions: ring 0 = home, ring 1 = neighbours, ring 2+ = rest of US ============
INSERT INTO public.ingest_regions (state_code, ring, priority, active) VALUES
  ('IN', 0, 10, true),
  ('IL', 1, 20, true), ('MI', 1, 20, true), ('OH', 1, 20, true), ('KY', 1, 20, true), ('WI', 1, 20, true),
  ('MO', 2, 40, false), ('IA', 2, 40, false), ('MN', 2, 40, false), ('TN', 2, 40, false), ('PA', 2, 40, false),
  ('WV', 2, 40, false), ('KS', 2, 40, false), ('NE', 2, 40, false), ('AR', 2, 40, false), ('NC', 2, 40, false),
  ('VA', 2, 40, false), ('NY', 2, 40, false),
  ('AL', 3, 60, false), ('AK', 3, 60, false), ('AZ', 3, 60, false), ('CA', 3, 60, false), ('CO', 3, 60, false),
  ('CT', 3, 60, false), ('DE', 3, 60, false), ('FL', 3, 60, false), ('GA', 3, 60, false), ('HI', 3, 60, false),
  ('ID', 3, 60, false), ('LA', 3, 60, false), ('ME', 3, 60, false), ('MD', 3, 60, false), ('MA', 3, 60, false),
  ('MS', 3, 60, false), ('MT', 3, 60, false), ('NV', 3, 60, false), ('NH', 3, 60, false), ('NJ', 3, 60, false),
  ('NM', 3, 60, false), ('ND', 3, 60, false), ('OK', 3, 60, false), ('OR', 3, 60, false), ('RI', 3, 60, false),
  ('SC', 3, 60, false), ('SD', 3, 60, false), ('TX', 3, 60, false), ('UT', 3, 60, false), ('VT', 3, 60, false),
  ('WA', 3, 60, false), ('WY', 3, 60, false), ('DC', 3, 60, false);