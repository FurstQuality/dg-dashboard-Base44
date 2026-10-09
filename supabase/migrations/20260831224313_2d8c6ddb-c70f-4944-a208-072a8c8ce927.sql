-- 1) Event series
CREATE TABLE public.event_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  season text,
  year integer,
  sanction_level text NOT NULL DEFAULT 'unsanctioned',
  points_system text NOT NULL DEFAULT 'standard',
  points_table jsonb NOT NULL DEFAULT '[]'::jsonb,
  counting_events integer,
  drop_worst integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'public',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_series TO authenticated;
GRANT SELECT ON public.event_series TO anon;
GRANT ALL ON public.event_series TO service_role;

ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public series are readable"
  ON public.event_series FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Owners and club managers read their series"
  ON public.event_series FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (club_id IS NOT NULL AND public.can_manage_club(club_id, auth.uid()))
  );

CREATE POLICY "Owners and club managers create series"
  ON public.event_series FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (club_id IS NULL OR public.can_manage_club(club_id, auth.uid()))
  );

CREATE POLICY "Owners and club managers update series"
  ON public.event_series FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (club_id IS NOT NULL AND public.can_manage_club(club_id, auth.uid()))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (club_id IS NOT NULL AND public.can_manage_club(club_id, auth.uid()))
  );

CREATE POLICY "Owners and club managers delete series"
  ON public.event_series FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (club_id IS NOT NULL AND public.can_manage_club(club_id, auth.uid()))
  );

CREATE TRIGGER event_series_set_updated_at
  BEFORE UPDATE ON public.event_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX event_series_owner_idx ON public.event_series (owner_id);
CREATE INDEX event_series_club_idx ON public.event_series (club_id);

-- 2) Series links + tournament shape
ALTER TABLE public.tournaments
  ADD COLUMN series_id uuid REFERENCES public.event_series(id) ON DELETE SET NULL,
  ADD COLUMN tournament_shape text NOT NULL DEFAULT 'single';

ALTER TABLE public.leagues
  ADD COLUMN series_id uuid REFERENCES public.event_series(id) ON DELETE SET NULL,
  ADD COLUMN standings_style text NOT NULL DEFAULT 'independent',
  ADD COLUMN min_nights_for_average integer NOT NULL DEFAULT 3;

CREATE INDEX tournaments_series_idx ON public.tournaments (series_id);
CREATE INDEX leagues_series_idx ON public.leagues (series_id);

UPDATE public.leagues
   SET standings_style = 'best_n'
 WHERE best_n_weeks IS NOT NULL AND best_n_weeks > 0;

-- 3) Round competition context
ALTER TABLE public.rounds
  ADD COLUMN round_context text NOT NULL DEFAULT 'casual',
  ADD COLUMN play_format text NOT NULL DEFAULT 'singles';

UPDATE public.rounds SET round_context = 'tournament_round'
 WHERE tournament_id IS NOT NULL OR tournament_round_id IS NOT NULL;
UPDATE public.rounds SET round_context = 'league_night'
 WHERE league_event_id IS NOT NULL AND tournament_id IS NULL AND tournament_round_id IS NULL;

CREATE INDEX rounds_context_idx ON public.rounds (round_context);

-- 4) Rules snapshots
ALTER TABLE public.league_events
  ADD COLUMN rules_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.tournament_rounds
  ADD COLUMN rules_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;