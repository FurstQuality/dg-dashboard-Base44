CREATE TABLE public.event_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  target_kind text NOT NULL CHECK (target_kind IN ('tournament_round','league_event','round')),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  tournament_round_id uuid REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  league_event_id uuid REFERENCES public.league_events(id) ON DELETE CASCADE,
  round_id uuid REFERENCES public.rounds(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  layout_id uuid REFERENCES public.course_layouts(id) ON DELETE SET NULL,
  label text,
  pin_hash text,
  pin_salt text,
  allow_guest_cards boolean NOT NULL DEFAULT true,
  allow_caddy boolean NOT NULL DEFAULT true,
  ai_allowance integer NOT NULL DEFAULT 5,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_join_codes TO authenticated;
GRANT ALL ON public.event_join_codes TO service_role;
ALTER TABLE public.event_join_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors manage their own join codes"
  ON public.event_join_codes FOR ALL TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE INDEX event_join_codes_created_by_idx ON public.event_join_codes (created_by);
CREATE INDEX event_join_codes_round_idx ON public.event_join_codes (round_id);

CREATE TABLE public.guest_scorers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.event_join_codes(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  display_name text NOT NULL,
  division_name text,
  pdga_number text,
  round_id uuid REFERENCES public.rounds(id) ON DELETE SET NULL,
  round_player_id uuid REFERENCES public.round_players(id) ON DELETE SET NULL,
  scores_whole_card boolean NOT NULL DEFAULT true,
  ai_used integer NOT NULL DEFAULT 0,
  claim_token text UNIQUE,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_scorers TO authenticated;
GRANT ALL ON public.guest_scorers TO service_role;
ALTER TABLE public.guest_scorers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors see guest scorekeepers on their codes"
  ON public.guest_scorers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.event_join_codes c
    WHERE c.id = guest_scorers.code_id AND c.created_by = auth.uid()
  ));

CREATE POLICY "Players see their own claimed guest cards"
  ON public.guest_scorers FOR SELECT TO authenticated
  USING (claimed_by = auth.uid());

CREATE INDEX guest_scorers_code_idx ON public.guest_scorers (code_id);
CREATE INDEX guest_scorers_round_idx ON public.guest_scorers (round_id);

CREATE TABLE public.guest_score_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scorer_id uuid NOT NULL REFERENCES public.guest_scorers(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL REFERENCES public.round_players(id) ON DELETE CASCADE,
  hole_number integer NOT NULL CHECK (hole_number BETWEEN 1 AND 36),
  strokes integer CHECK (strokes IS NULL OR strokes BETWEEN 1 AND 30),
  penalties integer NOT NULL DEFAULT 0 CHECK (penalties BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scorer_id, round_player_id, hole_number)
);

GRANT SELECT ON public.guest_score_entries TO authenticated;
GRANT ALL ON public.guest_score_entries TO service_role;
ALTER TABLE public.guest_score_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors see guest entries on their codes"
  ON public.guest_score_entries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.guest_scorers g
    JOIN public.event_join_codes c ON c.id = g.code_id
    WHERE g.id = guest_score_entries.scorer_id AND c.created_by = auth.uid()
  ));

CREATE INDEX guest_score_entries_round_idx ON public.guest_score_entries (round_id, hole_number);

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS scorekeeper_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scores_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_code_id uuid REFERENCES public.event_join_codes(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at_guest()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_join_codes_touch BEFORE UPDATE ON public.event_join_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_guest();
CREATE TRIGGER guest_scorers_touch BEFORE UPDATE ON public.guest_scorers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_guest();
CREATE TRIGGER guest_score_entries_touch BEFORE UPDATE ON public.guest_score_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_guest();