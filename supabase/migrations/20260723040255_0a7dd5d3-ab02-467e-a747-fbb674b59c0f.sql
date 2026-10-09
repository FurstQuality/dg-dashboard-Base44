
-- Tournaments: course + logistics
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS layout_id uuid REFERENCES public.course_layouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_zone text,
  ADD COLUMN IF NOT EXISTS tee_time_type text,
  ADD COLUMN IF NOT EXISTS players_per_card int DEFAULT 4,
  ADD COLUMN IF NOT EXISTS player_pack_notes text,
  ADD COLUMN IF NOT EXISTS payout_type text,
  ADD COLUMN IF NOT EXISTS payout_ratio numeric,
  ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS refund_policy text,
  ADD COLUMN IF NOT EXISTS td_name text,
  ADD COLUMN IF NOT EXISTS td_email text,
  ADD COLUMN IF NOT EXISTS td_phone text,
  ADD COLUMN IF NOT EXISTS rules_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS registration_url text,
  ADD COLUMN IF NOT EXISTS check_in_opens timestamptz,
  ADD COLUMN IF NOT EXISTS players_meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdga_event_number text,
  ADD COLUMN IF NOT EXISTS ace_pot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ctp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS players_pack_cents int NOT NULL DEFAULT 0;

-- Tournament rounds: per-round tee logistics
ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS tee_time_type text,
  ADD COLUMN IF NOT EXISTS shotgun_time time,
  ADD COLUMN IF NOT EXISTS tee_time_start time,
  ADD COLUMN IF NOT EXISTS tee_time_interval_min int,
  ADD COLUMN IF NOT EXISTS holes_played int,
  ADD COLUMN IF NOT EXISTS notes text;

-- Divisions: PDGA metadata
ALTER TABLE public.tournament_divisions
  ADD COLUMN IF NOT EXISTS pdga_code text,
  ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age_min int,
  ADD COLUMN IF NOT EXISTS age_max int;

-- Leagues: course + schedule + format
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS layout_id uuid REFERENCES public.course_layouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'singles',
  ADD COLUMN IF NOT EXISTS handicap_method text,
  ADD COLUMN IF NOT EXISTS day_of_week int,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS holes_played int DEFAULT 18,
  ADD COLUMN IF NOT EXISTS weeks_planned int,
  ADD COLUMN IF NOT EXISTS best_n_weeks int,
  ADD COLUMN IF NOT EXISTS entry_fee_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ace_pot_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctp_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_notes text,
  ADD COLUMN IF NOT EXISTS rules_url text,
  ADD COLUMN IF NOT EXISTS td_name text,
  ADD COLUMN IF NOT EXISTS td_email text,
  ADD COLUMN IF NOT EXISTS td_phone text;

-- Tournament checklist items
CREATE TABLE IF NOT EXISTS public.tournament_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('pre','day_of','post')),
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_checklist_items TO authenticated;
GRANT SELECT ON public.tournament_checklist_items TO anon;
GRANT ALL ON public.tournament_checklist_items TO service_role;
ALTER TABLE public.tournament_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views checklist" ON public.tournament_checklist_items FOR SELECT USING (true);
CREATE POLICY "TD manages checklist" ON public.tournament_checklist_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()));
CREATE INDEX IF NOT EXISTS tournament_checklist_items_tournament_idx
  ON public.tournament_checklist_items(tournament_id, phase, sort_order);
CREATE TRIGGER trg_tournament_checklist_updated
  BEFORE UPDATE ON public.tournament_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- League divisions
CREATE TABLE IF NOT EXISTS public.league_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  pdga_code text,
  min_rating int,
  max_rating int,
  gender text,
  age_min int,
  age_max int,
  entry_fee_cents int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_divisions TO authenticated;
GRANT SELECT ON public.league_divisions TO anon;
GRANT ALL ON public.league_divisions TO service_role;
ALTER TABLE public.league_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views league divisions" ON public.league_divisions FOR SELECT USING (true);
CREATE POLICY "TD manages league divisions" ON public.league_divisions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = league_id AND l.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = league_id AND l.owner_id = auth.uid()));
CREATE INDEX IF NOT EXISTS league_divisions_league_idx ON public.league_divisions(league_id, sort_order);
