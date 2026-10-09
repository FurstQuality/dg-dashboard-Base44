
CREATE TABLE IF NOT EXISTS public.putting_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  location text,
  basket_latitude double precision,
  basket_longitude double precision,
  wind_mph integer,
  wind_dir text,
  conditions text,
  markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_drills jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.putting_putts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.putting_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  putt_index integer NOT NULL DEFAULT 0,
  distance_ft integer NOT NULL,
  made boolean NOT NULL,
  disc_id uuid,
  mold_id uuid,
  disc_label text,
  drill_id text,
  putt_style text,
  landed_latitude double precision,
  landed_longitude double precision,
  gps_accuracy_m real,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS putting_putts_session_idx ON public.putting_putts(session_id, putt_index);
CREATE INDEX IF NOT EXISTS putting_putts_user_idx ON public.putting_putts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS putting_sessions_user_idx ON public.putting_sessions(user_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.putting_sessions TO authenticated;
GRANT ALL ON public.putting_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.putting_putts TO authenticated;
GRANT ALL ON public.putting_putts TO service_role;

ALTER TABLE public.putting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.putting_putts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own putting sessions"
  ON public.putting_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own putts"
  ON public.putting_putts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_putting_sessions_updated_at
  BEFORE UPDATE ON public.putting_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
