CREATE TABLE public.external_round_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_round_id uuid NOT NULL REFERENCES public.external_rounds(id) ON DELETE CASCADE,
  hole_number int NOT NULL CHECK (hole_number > 0),
  par int,
  strokes int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_round_id, hole_number)
);

CREATE INDEX external_round_holes_round_idx ON public.external_round_holes(external_round_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_round_holes TO authenticated;
GRANT ALL ON public.external_round_holes TO service_role;

ALTER TABLE public.external_round_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their external round holes"
  ON public.external_round_holes
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.external_rounds er WHERE er.id = external_round_id AND er.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.external_rounds er WHERE er.id = external_round_id AND er.user_id = auth.uid()));