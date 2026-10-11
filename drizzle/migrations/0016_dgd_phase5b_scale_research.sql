ALTER TABLE public.dgd_calibration_subjects
  ADD COLUMN IF NOT EXISTS cohort text NOT NULL DEFAULT 'VALIDATION_STRATIFIED',
  ADD COLUMN IF NOT EXISTS sampling jsonb;
COMMENT ON COLUMN public.dgd_calibration_subjects.cohort IS 'VALIDATION_STRATIFIED (oversampled by rating band, model coverage only) or BENCHMARK_RANDOM (uniform PDGA-number sample, percentile benchmark candidate)';

CREATE TABLE public.dgd_display_scales (
  scale_version text PRIMARY KEY,
  model_version text NOT NULL,
  transform_type text NOT NULL,
  anchor numeric NOT NULL,
  slope numeric NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_behavior text NOT NULL,
  max_behavior text NOT NULL,
  calibration_dataset_version text NOT NULL,
  status text NOT NULL DEFAULT 'CANDIDATE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dgd_display_scales TO service_role;
ALTER TABLE public.dgd_display_scales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read display scales" ON public.dgd_display_scales FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
GRANT SELECT ON public.dgd_display_scales TO authenticated;

CREATE TABLE public.dgd_benchmark_versions (
  benchmark_version text PRIMARY KEY,
  model_version text NOT NULL,
  benchmark_date date NOT NULL,
  population_definition text NOT NULL,
  sample_size integer NOT NULL,
  skill_quantiles jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RESEARCH_ONLY',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dgd_benchmark_versions TO service_role;
GRANT SELECT ON public.dgd_benchmark_versions TO authenticated;
ALTER TABLE public.dgd_benchmark_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read benchmarks" ON public.dgd_benchmark_versions FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_v12_display_candidates (
  user_id uuid NOT NULL,
  scale_version text NOT NULL REFERENCES public.dgd_display_scales(scale_version),
  model_version text NOT NULL,
  latent_skill numeric NOT NULL,
  display_rating numeric NOT NULL,
  display_form numeric,
  confidence numeric,
  benchmark_version text REFERENCES public.dgd_benchmark_versions(benchmark_version),
  percentile numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scale_version)
);
GRANT ALL ON public.dgd_v12_display_candidates TO service_role;
ALTER TABLE public.dgd_v12_display_candidates ENABLE ROW LEVEL SECURITY;
-- No client policies: read only through the gated function below.

CREATE OR REPLACE FUNCTION public.get_my_dgd_scale_candidates()
RETURNS TABLE(scale_version text, transform_type text, status text, display_rating numeric, display_form numeric, confidence numeric, benchmark_version text, benchmark_population text, benchmark_sample integer, percentile numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.scale_version, s.transform_type, s.status, c.display_rating, c.display_form, c.confidence,
         c.benchmark_version, b.population_definition, b.sample_size, c.percentile
  FROM public.dgd_v12_display_candidates c
  JOIN public.dgd_display_scales s USING (scale_version)
  LEFT JOIN public.dgd_benchmark_versions b ON b.benchmark_version = c.benchmark_version
  WHERE c.user_id = auth.uid() AND public.dgd_preview_allowed()
  ORDER BY c.scale_version;
$$;
REVOKE ALL ON FUNCTION public.get_my_dgd_scale_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_scale_candidates() TO authenticated;