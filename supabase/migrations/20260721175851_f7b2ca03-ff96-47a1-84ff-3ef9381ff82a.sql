
-- Enums
CREATE TYPE public.tournament_status AS ENUM ('draft','published','registration_open','registration_closed','in_progress','completed','cancelled');
CREATE TYPE public.tournament_format AS ENUM ('stroke_play','match_play','best_shot','doubles','singles');
CREATE TYPE public.registration_status AS ENUM ('pending','confirmed','waitlist','withdrawn','checked_in');
CREATE TYPE public.payment_status AS ENUM ('unpaid','paid','refunded','waived');
CREATE TYPE public.league_status AS ENUM ('draft','active','completed','cancelled');

-- Tournaments
CREATE TABLE public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  format public.tournament_format NOT NULL DEFAULT 'stroke_play',
  status public.tournament_status NOT NULL DEFAULT 'draft',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  registration_opens TIMESTAMPTZ,
  registration_closes TIMESTAMPTZ,
  location TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  pdga_sanctioned BOOLEAN NOT NULL DEFAULT false,
  pdga_tier TEXT,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER,
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournaments TO anon;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view non-draft tournaments" ON public.tournaments FOR SELECT USING (status <> 'draft' OR owner_id = auth.uid());
CREATE POLICY "TDs create tournaments" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "TDs update own tournaments" ON public.tournaments FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "TDs delete own tournaments" ON public.tournaments FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER trg_tournaments_updated BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Divisions
CREATE TABLE public.tournament_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER,
  min_rating INTEGER,
  max_rating INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_divisions TO authenticated;
GRANT SELECT ON public.tournament_divisions TO anon;
GRANT ALL ON public.tournament_divisions TO service_role;
ALTER TABLE public.tournament_divisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views divisions" ON public.tournament_divisions FOR SELECT USING (true);
CREATE POLICY "TD manages divisions" ON public.tournament_divisions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()));

-- Tournament rounds
CREATE TABLE public.tournament_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  layout_id UUID REFERENCES public.course_layouts(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_rounds TO authenticated;
GRANT SELECT ON public.tournament_rounds TO anon;
GRANT ALL ON public.tournament_rounds TO service_role;
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views rounds" ON public.tournament_rounds FOR SELECT USING (true);
CREATE POLICY "TD manages rounds" ON public.tournament_rounds FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()));

-- Registrations
CREATE TABLE public.tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  division_id UUID NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdga_number TEXT,
  status public.registration_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_registrations TO authenticated;
GRANT SELECT ON public.tournament_registrations TO anon;
GRANT ALL ON public.tournament_registrations TO service_role;
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views registrations" ON public.tournament_registrations FOR SELECT USING (true);
CREATE POLICY "Player registers self" ON public.tournament_registrations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Player updates own registration" ON public.tournament_registrations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()));
CREATE POLICY "Player or TD deletes registration" ON public.tournament_registrations FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()));
CREATE TRIGGER trg_treg_updated BEFORE UPDATE ON public.tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Tournament scores
CREATE TABLE public.tournament_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES public.tournament_registrations(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL,
  strokes INTEGER NOT NULL,
  penalties INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, registration_id, hole_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_scores TO authenticated;
GRANT SELECT ON public.tournament_scores TO anon;
GRANT ALL ON public.tournament_scores TO service_role;
ALTER TABLE public.tournament_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views scores" ON public.tournament_scores FOR SELECT USING (true);
CREATE POLICY "Player or TD writes scores" ON public.tournament_scores FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tournament_registrations r WHERE r.id = registration_id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.tournament_rounds tr JOIN public.tournaments t ON t.id = tr.tournament_id WHERE tr.id = round_id AND t.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tournament_registrations r WHERE r.id = registration_id AND r.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.tournament_rounds tr JOIN public.tournaments t ON t.id = tr.tournament_id WHERE tr.id = round_id AND t.owner_id = auth.uid())
  );
CREATE TRIGGER trg_tscore_updated BEFORE UPDATE ON public.tournament_scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leagues
CREATE TABLE public.leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  season TEXT,
  status public.league_status NOT NULL DEFAULT 'draft',
  points_system TEXT NOT NULL DEFAULT 'standard',
  cover_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT SELECT ON public.leagues TO anon;
GRANT ALL ON public.leagues TO service_role;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views leagues" ON public.leagues FOR SELECT USING (status <> 'draft' OR owner_id = auth.uid());
CREATE POLICY "Owner creates league" ON public.leagues FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner updates league" ON public.leagues FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner deletes league" ON public.leagues FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER trg_leagues_updated BEFORE UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- League events
CREATE TABLE public.league_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  name TEXT,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  event_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_events TO authenticated;
GRANT SELECT ON public.league_events TO anon;
GRANT ALL ON public.league_events TO service_role;
ALTER TABLE public.league_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views league events" ON public.league_events FOR SELECT USING (true);
CREATE POLICY "Owner manages league events" ON public.league_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = league_id AND l.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = league_id AND l.owner_id = auth.uid()));

-- League registrations
CREATE TABLE public.league_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  division TEXT,
  pdga_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_registrations TO authenticated;
GRANT SELECT ON public.league_registrations TO anon;
GRANT ALL ON public.league_registrations TO service_role;
ALTER TABLE public.league_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone views league regs" ON public.league_registrations FOR SELECT USING (true);
CREATE POLICY "Player self-registers league" ON public.league_registrations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Player or owner deletes league reg" ON public.league_registrations FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = league_id AND l.owner_id = auth.uid()));
