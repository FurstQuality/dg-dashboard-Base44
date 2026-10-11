CREATE TABLE public.pdga_import_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_round_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('invalid_import_duplicate','pending_source_review','restored')),
  duplicate_of uuid,
  match_basis text,
  original_row jsonb NOT NULL,
  real_pdga jsonb,
  canonical_round_id uuid,
  canonical_snapshot jsonb,
  affects_legacy boolean NOT NULL DEFAULT false,
  affects_v1 boolean NOT NULL DEFAULT false,
  affects_v11 boolean NOT NULL DEFAULT false,
  phase text NOT NULL DEFAULT 'phase-3.9',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  review_note text
);
COMMENT ON TABLE public.pdga_import_corrections IS 'Quarantined PDGA importer artifacts. original_row is the verbatim external_rounds row; rows here never feed stats or ratings.';
CREATE INDEX pdga_import_corrections_user_idx ON public.pdga_import_corrections (user_id);
GRANT SELECT ON public.pdga_import_corrections TO authenticated;
GRANT ALL ON public.pdga_import_corrections TO service_role;
ALTER TABLE public.pdga_import_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read import corrections" ON public.pdga_import_corrections
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- Block quarantined artifacts from being imported again.
CREATE OR REPLACE FUNCTION public.block_quarantined_import()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pdga_import_corrections q
     WHERE q.user_id = NEW.user_id
       AND q.status <> 'restored'
       AND COALESCE(q.original_row->>'source','') = COALESCE(NEW.source,'')
       AND q.original_row->>'played_on' = NEW.played_on::text
       AND COALESCE(q.original_row->>'event_name','') = COALESCE(NEW.event_name,'')
       AND COALESCE(q.original_row->>'score','') = COALESCE(NEW.score::text,'')
       AND COALESCE(q.original_row->>'round_rating','') = COALESCE(NEW.round_rating::text,'')
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER external_rounds_block_quarantined BEFORE INSERT ON public.external_rounds
  FOR EACH ROW EXECUTE FUNCTION public.block_quarantined_import();