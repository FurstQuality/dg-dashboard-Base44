CREATE TABLE public.dgd_candidate_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_model text NOT NULL,
  control_model text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  report jsonb,
  triggered_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error text
);
GRANT SELECT ON public.dgd_candidate_reports TO authenticated;
GRANT ALL ON public.dgd_candidate_reports TO service_role;
ALTER TABLE public.dgd_candidate_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read candidate reports" ON public.dgd_candidate_reports FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_event_round_difficulty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dgd_candidate_reports(id) ON DELETE CASCADE,
  calculation_version text NOT NULL,
  event_round_key text NOT NULL,
  played_on date NOT NULL,
  layout_key text NOT NULL,
  event_round_layout_difficulty_mu double precision NOT NULL,
  event_round_layout_difficulty_sigma double precision NOT NULL,
  participant_count integer NOT NULL,
  effective_participant_count double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, event_round_key)
);
CREATE INDEX dgd_event_round_difficulty_report_idx ON public.dgd_event_round_difficulty(report_id);
GRANT SELECT ON public.dgd_event_round_difficulty TO authenticated;
GRANT ALL ON public.dgd_event_round_difficulty TO service_role;
ALTER TABLE public.dgd_event_round_difficulty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read event round difficulty" ON public.dgd_event_round_difficulty FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));