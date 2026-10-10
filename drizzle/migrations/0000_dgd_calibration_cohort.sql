-- Phase 3.7: DGD calibration cohort. Admin-only research data; never a user account or public profile.
CREATE TABLE public.dgd_calibration_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL UNIQUE,
  display_name text,
  official_rating integer,
  linked_user_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fetched','insufficient','failed','removed')),
  last_fetched_at timestamptz,
  last_error text,
  rounds_parsed integer NOT NULL DEFAULT 0,
  source_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dgd_calibration_subjects IS 'Admin-only DGD calibration subjects keyed by PDGA number. Not auth users; linked_user_id is set only when a profile already claims that PDGA number.';
CREATE INDEX dgd_calibration_subjects_linked_idx ON public.dgd_calibration_subjects(linked_user_id);

CREATE TABLE public.dgd_calibration_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.dgd_calibration_subjects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'pdga',
  source_url text NOT NULL,
  pdga_event_id text,
  event_name text,
  tier text,
  division text,
  round_number integer,
  played_on date NOT NULL,
  score integer,
  round_rating integer,
  evaluated boolean,
  included boolean,
  layout_node_ids text[] NOT NULL DEFAULT '{}',
  layout_name text,
  hole_count integer,
  par integer,
  distance_ft integer,
  dedupe_key text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, dedupe_key)
);
CREATE INDEX dgd_calibration_rounds_subject_idx ON public.dgd_calibration_rounds(subject_id, played_on);

CREATE TABLE public.dgd_calibration_notes (
  subject_id uuid PRIMARY KEY REFERENCES public.dgd_calibration_subjects(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dgd_calibration_notes IS 'Private admin observations. Never read by any rating calculation.';

CREATE TABLE public.dgd_calibration_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version text NOT NULL,
  triggered_by uuid,
  status text NOT NULL DEFAULT 'running',
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX dgd_calibration_reports_started_idx ON public.dgd_calibration_reports(started_at DESC);

GRANT SELECT ON public.dgd_calibration_subjects, public.dgd_calibration_rounds, public.dgd_calibration_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.dgd_calibration_notes TO authenticated;
GRANT ALL ON public.dgd_calibration_subjects, public.dgd_calibration_rounds, public.dgd_calibration_notes, public.dgd_calibration_reports TO service_role;

ALTER TABLE public.dgd_calibration_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_calibration_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_calibration_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dgd_calibration_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read calibration subjects" ON public.dgd_calibration_subjects FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins read calibration rounds" ON public.dgd_calibration_rounds FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins read calibration reports" ON public.dgd_calibration_reports FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins read calibration notes" ON public.dgd_calibration_notes FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins write calibration notes" ON public.dgd_calibration_notes FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()) AND updated_by = auth.uid());
CREATE POLICY "Platform admins update calibration notes" ON public.dgd_calibration_notes FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()) AND updated_by = auth.uid());
