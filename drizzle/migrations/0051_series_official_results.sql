ALTER TABLE public.event_series ADD COLUMN IF NOT EXISTS host_name text;
COMMENT ON COLUMN public.event_series.host_name IS 'Display host when the hosting club is not in the app (falls back after club_id).';

CREATE TABLE public.series_official_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.event_series(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  division text NOT NULL,
  place integer NOT NULL CHECK (place >= 1),
  field_size integer NOT NULL CHECK (field_size >= 1),
  player_name text NOT NULL,
  player_key text NOT NULL,
  pdga_number integer,
  user_id uuid,
  source text NOT NULL DEFAULT 'DISC_GOLF_SCENE',
  source_url text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, division, player_key)
);
CREATE INDEX series_official_results_series_idx ON public.series_official_results(series_id);
COMMENT ON TABLE public.series_official_results IS 'Official finish order for series stops scored outside the app (PDGA / Disc Golf Scene). When a stop has rows here they replace in-app scoring for series points.';

GRANT SELECT ON public.series_official_results TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.series_official_results TO authenticated;
GRANT ALL ON public.series_official_results TO service_role;
ALTER TABLE public.series_official_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read results of public series" ON public.series_official_results FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.event_series s WHERE s.id = series_id AND (s.visibility = 'public' OR s.owner_id = auth.uid())));
CREATE POLICY "Series owner manages results" ON public.series_official_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_series s WHERE s.id = series_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_series s WHERE s.id = series_id AND s.owner_id = auth.uid()));