CREATE TABLE public.dgp_skill_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_code text NOT NULL UNIQUE,
  udisc_band text NOT NULL,
  udisc_min integer,
  udisc_max integer,
  pdga_band text NOT NULL,
  pdga_min integer,
  pdga_max integer,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dgp_skill_groups TO authenticated;
GRANT ALL ON public.dgp_skill_groups TO service_role;
ALTER TABLE public.dgp_skill_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in players can read skill groups"
  ON public.dgp_skill_groups FOR SELECT TO authenticated USING (true);

CREATE TABLE public.dgp_shot_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_group_id uuid NOT NULL REFERENCES public.dgp_skill_groups(id) ON DELETE CASCADE,
  disc_class text NOT NULL,
  throw_style text NOT NULL,
  shot_shape text NOT NULL,
  speed_min numeric(4,1),
  speed_max numeric(4,1),
  submissions integer NOT NULL DEFAULT 0,
  source_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dgp_shot_profiles_unique UNIQUE (skill_group_id, disc_class, throw_style, shot_shape),
  CONSTRAINT dgp_shot_profiles_class_check CHECK (disc_class IN ('distance_driver','fairway_driver','midrange','putter')),
  CONSTRAINT dgp_shot_profiles_style_check CHECK (throw_style IN ('backhand','forehand')),
  CONSTRAINT dgp_shot_profiles_shape_check CHECK (shot_shape IN ('hyzer','straight','anhyzer'))
);

CREATE INDEX dgp_shot_profiles_group_idx ON public.dgp_shot_profiles (skill_group_id);
CREATE INDEX dgp_shot_profiles_slot_idx ON public.dgp_shot_profiles (disc_class, throw_style, shot_shape);

GRANT SELECT ON public.dgp_shot_profiles TO authenticated;
GRANT ALL ON public.dgp_shot_profiles TO service_role;
ALTER TABLE public.dgp_shot_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in players can read shot profiles"
  ON public.dgp_shot_profiles FOR SELECT TO authenticated USING (true);

CREATE TABLE public.dgp_shot_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.dgp_shot_profiles(id) ON DELETE CASCADE,
  answer_kind text NOT NULL,
  label text NOT NULL,
  submissions integer NOT NULL DEFAULT 0,
  share numeric(5,2),
  rank integer NOT NULL DEFAULT 0,
  brand text,
  mold text,
  mold_id uuid REFERENCES public.disc_molds(id) ON DELETE SET NULL,
  weight_min_g integer,
  weight_max_g integer,
  distance_min_ft integer,
  distance_max_ft integer,
  speed numeric(4,1),
  glide numeric(4,1),
  turn numeric(4,1),
  fade numeric(4,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dgp_shot_answers_kind_check CHECK (answer_kind IN ('disc','weight','distance','flight'))
);

CREATE INDEX dgp_shot_answers_profile_idx ON public.dgp_shot_answers (profile_id, answer_kind, rank);
CREATE INDEX dgp_shot_answers_mold_idx ON public.dgp_shot_answers (mold_id) WHERE mold_id IS NOT NULL;
CREATE INDEX dgp_shot_answers_brand_mold_idx ON public.dgp_shot_answers (brand, mold);

GRANT SELECT ON public.dgp_shot_answers TO authenticated;
GRANT ALL ON public.dgp_shot_answers TO service_role;
ALTER TABLE public.dgp_shot_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in players can read shot answers"
  ON public.dgp_shot_answers FOR SELECT TO authenticated USING (true);

CREATE TABLE public.dgp_ingest_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'discgolfprofessor.com',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0,
  profiles_written integer NOT NULL DEFAULT 0,
  answers_written integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dgp_ingest_runs TO authenticated;
GRANT ALL ON public.dgp_ingest_runs TO service_role;
ALTER TABLE public.dgp_ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read ingest runs"
  ON public.dgp_ingest_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER dgp_skill_groups_set_updated_at
  BEFORE UPDATE ON public.dgp_skill_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER dgp_shot_profiles_set_updated_at
  BEFORE UPDATE ON public.dgp_shot_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();