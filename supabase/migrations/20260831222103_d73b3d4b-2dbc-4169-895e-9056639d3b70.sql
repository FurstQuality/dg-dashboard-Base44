-- Shared event setup fields for tournaments and leagues.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tournaments','leagues'] LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS format_family text NOT NULL DEFAULT ''singles'',
      ADD COLUMN IF NOT EXISTS team_size integer,
      ADD COLUMN IF NOT EXISTS pairing_method text,
      ADD COLUMN IF NOT EXISTS play_style text,
      ADD COLUMN IF NOT EXISTS signup_type text NOT NULL DEFAULT ''formal'',
      ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT ''public'',
      ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT ''stroke_play'',
      ADD COLUMN IF NOT EXISTS card_creation text NOT NULL DEFAULT ''players_and_admin'',
      ADD COLUMN IF NOT EXISTS stats_mode text NOT NULL DEFAULT ''standard'',
      ADD COLUMN IF NOT EXISTS handicap_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS tiebreaker text NOT NULL DEFAULT ''playoff'',
      ADD COLUMN IF NOT EXISTS card_selection_required boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS reentry_allowed boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS scorecard_message text,
      ADD COLUMN IF NOT EXISTS setup jsonb NOT NULL DEFAULT ''{}''::jsonb', t);
  END LOOP;
END $$;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS event_template text;
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS event_template text;
