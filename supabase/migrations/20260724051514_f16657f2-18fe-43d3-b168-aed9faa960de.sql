
CREATE TABLE public.pdga_event_field (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_ref TEXT NOT NULL,
  pdga_number TEXT NOT NULL,
  name TEXT NOT NULL,
  division TEXT,
  rating INTEGER,
  place INTEGER,
  total_to_par INTEGER,
  total_strokes INTEGER,
  prize NUMERIC,
  points NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_ref, pdga_number, division)
);
CREATE INDEX pdga_event_field_event_idx ON public.pdga_event_field(event_ref);
CREATE INDEX pdga_event_field_pdga_idx ON public.pdga_event_field(pdga_number);
GRANT SELECT ON public.pdga_event_field TO anon, authenticated;
GRANT ALL ON public.pdga_event_field TO service_role;
ALTER TABLE public.pdga_event_field ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PDGA event field is public" ON public.pdga_event_field FOR SELECT USING (true);
