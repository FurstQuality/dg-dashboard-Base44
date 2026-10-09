CREATE TABLE public.event_directory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('pdga','disc_golf_scene','udisc')),
  source_event_id text NOT NULL,
  url text,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'tournament' CHECK (kind IN ('tournament','league','casual')),
  tier text,
  sanctioning text,
  start_date date,
  end_date date,
  venue_name text,
  city text,
  state text,
  country text,
  latitude double precision,
  longitude double precision,
  registration_status text,
  field_size integer,
  field_capacity integer,
  cover_url text,
  pdga_event_ref text,
  discovered_via text,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_event_id)
);

CREATE INDEX event_directory_start_date_idx ON public.event_directory (start_date);
CREATE INDEX event_directory_state_idx ON public.event_directory (state);
CREATE INDEX event_directory_source_idx ON public.event_directory (source);
CREATE INDEX event_directory_pdga_ref_idx ON public.event_directory (pdga_event_ref);

GRANT SELECT ON public.event_directory TO authenticated;
GRANT ALL ON public.event_directory TO service_role;
ALTER TABLE public.event_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in players can browse the event directory"
  ON public.event_directory FOR SELECT TO authenticated USING (true);

CREATE TRIGGER event_directory_set_updated_at
  BEFORE UPDATE ON public.event_directory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.event_directory_syncs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('pdga','disc_golf_scene','udisc')),
  scope text,
  found integer NOT NULL DEFAULT 0,
  upserted integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX event_directory_syncs_started_idx ON public.event_directory_syncs (started_at DESC);

GRANT SELECT ON public.event_directory_syncs TO authenticated;
GRANT ALL ON public.event_directory_syncs TO service_role;
ALTER TABLE public.event_directory_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in players can see directory refresh history"
  ON public.event_directory_syncs FOR SELECT TO authenticated USING (true);