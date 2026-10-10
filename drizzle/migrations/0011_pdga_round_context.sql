-- Phase 5A.4: recovered PDGA course/layout context, stored separately from
-- imported source rows with provenance. Superseded rows are kept for audit.
CREATE TABLE public.pdga_round_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_round_id uuid NOT NULL REFERENCES public.external_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  pdga_event_id text,
  event_name text,
  played_on date,
  round_number integer,
  division text,
  pool_count integer NOT NULL DEFAULT 0,
  layout_node_ids text[] NOT NULL DEFAULT '{}',
  layout_name text,
  hole_count integer,
  par integer,
  distance_ft integer,
  match_method text NOT NULL,
  provenance text NOT NULL DEFAULT 'pdga_player_details',
  source_url text,
  source_row_id uuid,
  source_fetched_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.pdga_round_context TO service_role;
GRANT SELECT ON public.pdga_round_context TO authenticated;
ALTER TABLE public.pdga_round_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read round context" ON public.pdga_round_context
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE UNIQUE INDEX pdga_round_context_current ON public.pdga_round_context(external_round_id) WHERE superseded_at IS NULL;
CREATE INDEX pdga_round_context_user ON public.pdga_round_context(user_id);