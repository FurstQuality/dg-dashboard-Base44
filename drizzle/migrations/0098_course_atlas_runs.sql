CREATE TABLE public.course_atlas_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','stopped')),
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_pass_at timestamptz,
  lease_until timestamptz,
  finished_at timestamptz,
  passes integer NOT NULL DEFAULT 0,
  idle_passes integer NOT NULL DEFAULT 0,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  stages jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text
);
CREATE UNIQUE INDEX course_atlas_runs_one_running ON public.course_atlas_runs ((status)) WHERE status = 'running';
CREATE INDEX course_atlas_runs_started_idx ON public.course_atlas_runs (started_at DESC);
GRANT SELECT ON public.course_atlas_runs TO authenticated;
GRANT ALL ON public.course_atlas_runs TO service_role;
ALTER TABLE public.course_atlas_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read atlas runs" ON public.course_atlas_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));