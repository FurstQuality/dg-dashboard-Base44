CREATE INDEX IF NOT EXISTS external_rounds_pdga_rating_hotpath_idx
  ON public.external_rounds (user_id, played_on DESC)
  WHERE source = 'pdga'
    AND format = 'singles'
    AND round_rating IS NOT NULL
    AND (included IS NULL OR included = true);

CREATE INDEX IF NOT EXISTS pdga_players_refreshed_idx
  ON public.pdga_players (refreshed_at DESC);