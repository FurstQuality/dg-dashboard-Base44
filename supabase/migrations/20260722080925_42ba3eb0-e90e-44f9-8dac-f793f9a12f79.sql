
-- Unified event schedule tracker: Disc Golf Scene, PDGA, in-app tournaments, and in-app leagues.
CREATE TYPE public.schedule_event_source AS ENUM ('disc_golf_scene', 'pdga', 'tournament', 'league', 'manual');
CREATE TYPE public.schedule_event_status AS ENUM ('interested', 'registered', 'waitlisted', 'confirmed', 'completed', 'withdrawn', 'cancelled');

CREATE TABLE public.scheduled_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source public.schedule_event_source NOT NULL DEFAULT 'manual',
  status public.schedule_event_status NOT NULL DEFAULT 'interested',
  -- Content
  title text NOT NULL,
  event_url text,
  location text,
  city text,
  state text,
  country text,
  starts_on date,
  ends_on date,
  starts_at timestamptz,
  registration_opens_at timestamptz,
  registration_deadline timestamptz,
  -- Divisions / registration
  division text,
  tier text, -- C-Tier, B-Tier, XA, etc.
  entry_fee_cents integer,
  currency text DEFAULT 'USD',
  spots_taken integer,
  spots_total integer,
  waitlist_position integer,
  -- External identity
  external_id text, -- Scene event slug or PDGA event id
  registration_url text,
  -- Internal linking (either tournament or league — never both)
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  -- Housekeeping
  notes text,
  raw jsonb, -- last parsed payload for debugging + refresh
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_events_user_url_unique UNIQUE (user_id, event_url)
);

CREATE INDEX scheduled_events_user_start_idx ON public.scheduled_events(user_id, starts_on);
CREATE INDEX scheduled_events_source_idx ON public.scheduled_events(source);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_events TO authenticated;
GRANT ALL ON public.scheduled_events TO service_role;

ALTER TABLE public.scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their scheduled events"
  ON public.scheduled_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_scheduled_events_updated_at
  BEFORE UPDATE ON public.scheduled_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Convenience view: upcoming schedule combined with internal tournaments/leagues owner-linked
-- (kept as a plain table for now; a view can be added later if needed).
