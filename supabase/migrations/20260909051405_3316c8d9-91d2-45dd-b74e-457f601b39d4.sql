CREATE TABLE public.throwing_profiles (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  handedness text NOT NULL DEFAULT 'right',
  primary_style text NOT NULL DEFAULT 'backhand',
  secondary_styles text[] NOT NULL DEFAULT '{}',
  years_playing numeric,
  rounds_per_month integer,
  field_work_per_month integer,
  power_band text,
  backhand_max_ft integer,
  backhand_comfort_ft integer,
  forehand_max_ft integer,
  forehand_comfort_ft integer,
  disc_speed_mph numeric,
  spin_rpm integer,
  launch_angle_deg numeric,
  nose_angle_deg numeric,
  hyzer_angle_deg numeric,
  wobble_deg numeric,
  measurement_device text,
  measured_at date,
  preferred_weight_min_g integer,
  preferred_weight_max_g integer,
  plastic_preference text,
  stability_bias text,
  shot_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  shot_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  putting_style text,
  putting_confident_ft integer,
  wind_comfort text,
  physical_notes text,
  goals text[] NOT NULL DEFAULT '{}',
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.throwing_profiles TO authenticated;
GRANT ALL ON public.throwing_profiles TO service_role;

ALTER TABLE public.throwing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage their own throwing profile"
  ON public.throwing_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_throwing_profiles_updated_at
  BEFORE UPDATE ON public.throwing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_discs
  ADD COLUMN IF NOT EXISTS throw_styles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shot_shapes text[] NOT NULL DEFAULT '{}';