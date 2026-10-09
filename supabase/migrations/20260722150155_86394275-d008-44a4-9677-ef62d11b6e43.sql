
-- App user connector: encrypted per-user connection handles (server-only)
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
-- Owner may see whether a connection exists (but not the ciphertext value in practice — kept simple)
CREATE POLICY "Users can view their own connection presence"
  ON public.app_user_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Extend scheduled_events source enum + add sync columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'event_source' AND e.enumlabel = 'google') THEN
    ALTER TYPE public.event_source ADD VALUE 'google';
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'event_source' AND e.enumlabel = 'manual') THEN
    ALTER TYPE public.event_source ADD VALUE 'manual';
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.scheduled_events
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS ics_uid text,
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS scheduled_events_user_range_idx
  ON public.scheduled_events (user_id, starts_on);
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_events_user_google_evt_idx
  ON public.scheduled_events (user_id, google_event_id) WHERE google_event_id IS NOT NULL;

-- Per-user ICS subscription token on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ics_feed_token text UNIQUE;
