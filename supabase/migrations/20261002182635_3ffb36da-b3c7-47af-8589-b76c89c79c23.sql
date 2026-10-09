CREATE TABLE public.dgd_player_layout_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL,
  experience_version text NOT NULL,
  run_id uuid REFERENCES public.dgd_calc_runs(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  layout_key text NOT NULL,
  course_key text,
  round_count integer NOT NULL DEFAULT 0,
  eligible_round_count integer NOT NULL DEFAULT 0,
  competitive_round_count integer NOT NULL DEFAULT 0,
  first_played_at date,
  last_played_at date,
  recent_round_count integer NOT NULL DEFAULT 0,
  average_dgd_round_performance double precision,
  average_strokes_vs_expectation double precision,
  first_time_layout_performance double precision,
  experienced_layout_performance double precision,
  familiarity_mu double precision NOT NULL DEFAULT 0,
  familiarity_sigma double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_version, user_id, layout_key)
);
GRANT SELECT ON public.dgd_player_layout_experience TO authenticated;
GRANT ALL ON public.dgd_player_layout_experience TO service_role;
ALTER TABLE public.dgd_player_layout_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read layout experience" ON public.dgd_player_layout_experience
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE INDEX dgd_ple_user_idx ON public.dgd_player_layout_experience (model_version, user_id);

CREATE TABLE public.dgd_player_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL,
  experience_version text NOT NULL,
  run_id uuid REFERENCES public.dgd_calc_runs(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  course_breadth double precision,
  generalization_confidence double precision,
  effective_layout_count double precision,
  unique_layouts integer NOT NULL DEFAULT 0,
  unique_courses integer NOT NULL DEFAULT 0,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_version, user_id)
);
GRANT SELECT ON public.dgd_player_experience TO authenticated;
GRANT ALL ON public.dgd_player_experience TO service_role;
ALTER TABLE public.dgd_player_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read player experience" ON public.dgd_player_experience
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER dgd_ple_updated BEFORE UPDATE ON public.dgd_player_layout_experience
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER dgd_pe_updated BEFORE UPDATE ON public.dgd_player_experience
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();