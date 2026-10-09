
-- Driving range sessions and throws
CREATE TABLE public.range_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  location text,
  tee_latitude double precision,
  tee_longitude double precision,
  wind_mph integer,
  wind_dir text,
  conditions text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX range_sessions_user_idx ON public.range_sessions(user_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.range_sessions TO authenticated;
GRANT ALL ON public.range_sessions TO service_role;
ALTER TABLE public.range_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "range_sessions_own" ON public.range_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER range_sessions_touch BEFORE UPDATE ON public.range_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.shot_shape AS ENUM (
  'hyzer','anhyzer','flat','flex','s_curve','hyzer_flip','turnover','spike_hyzer','skip','roller','tomahawk','thumber','scoober'
);

CREATE TYPE public.shot_intent AS ENUM ('max_distance','control','placement','safety_off_tee','approach','putt');

CREATE TABLE public.range_throws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.range_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  throw_index integer NOT NULL DEFAULT 0,
  disc_id uuid REFERENCES public.user_discs(id) ON DELETE SET NULL,
  mold_id uuid REFERENCES public.disc_molds(id) ON DELETE SET NULL,
  disc_label text,
  shape public.shot_shape,
  intent public.shot_intent NOT NULL DEFAULT 'max_distance',
  landed_latitude double precision NOT NULL,
  landed_longitude double precision NOT NULL,
  gps_accuracy_m real,
  distance_ft integer NOT NULL,
  lateral_ft integer,
  fairway_hit boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX range_throws_session_idx ON public.range_throws(session_id, throw_index);
CREATE INDEX range_throws_user_idx ON public.range_throws(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.range_throws TO authenticated;
GRANT ALL ON public.range_throws TO service_role;
ALTER TABLE public.range_throws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "range_throws_own" ON public.range_throws FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
