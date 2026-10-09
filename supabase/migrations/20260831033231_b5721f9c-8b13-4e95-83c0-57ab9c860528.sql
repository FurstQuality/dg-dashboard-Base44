-- 1. Player identity codes -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS player_code TEXT,
  ADD COLUMN IF NOT EXISTS qr_token TEXT;

CREATE OR REPLACE FUNCTION public.generate_player_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i INT;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE player_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_player_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.player_code IS NULL THEN
    NEW.player_code := public.generate_player_code();
  END IF;
  IF NEW.qr_token IS NULL THEN
    NEW.qr_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_player_identity ON public.profiles;
CREATE TRIGGER trg_ensure_player_identity
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_player_identity();

UPDATE public.profiles
SET player_code = public.generate_player_code()
WHERE player_code IS NULL;

UPDATE public.profiles
SET qr_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE qr_token IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN player_code SET NOT NULL,
  ALTER COLUMN qr_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_player_code_key ON public.profiles (player_code);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_qr_token_key ON public.profiles (qr_token);

-- Resolve a scanned QR token / typed player code to a player id only.
CREATE OR REPLACE FUNCTION public.resolve_player_identifier(_identifier TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.profiles
  WHERE auth.uid() IS NOT NULL
    AND (qr_token = _identifier OR player_code = upper(btrim(_identifier)))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_player_identifier(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_player_identifier(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_player_identifier(TEXT) TO service_role;

-- 2. Tournament check-in metadata -----------------------------------------
ALTER TABLE public.tournament_registrations
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS check_in_method TEXT;

ALTER TABLE public.tournament_registrations
  DROP CONSTRAINT IF EXISTS tournament_registrations_check_in_method_check;
ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_check_in_method_check
  CHECK (check_in_method IS NULL OR check_in_method IN ('scan', 'manual', 'self'));

CREATE INDEX IF NOT EXISTS tournament_registrations_checked_in_at_idx
  ON public.tournament_registrations (tournament_id, checked_in_at DESC);

-- 3. League registrations upgrade -----------------------------------------
ALTER TABLE public.league_registrations
  ADD COLUMN IF NOT EXISTS status public.registration_status NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES public.league_divisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_league_registrations_updated_at ON public.league_registrations;
CREATE TRIGGER trg_league_registrations_updated_at
  BEFORE UPDATE ON public.league_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS league_registrations_league_user_key
  ON public.league_registrations (league_id, user_id);

-- 4. League night attendance ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.league_event_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_event_id UUID NOT NULL REFERENCES public.league_events(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  check_in_method TEXT NOT NULL DEFAULT 'manual',
  paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_event_checkins_method_check
    CHECK (check_in_method IN ('scan', 'manual', 'self')),
  CONSTRAINT league_event_checkins_unique UNIQUE (league_event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_event_checkins TO authenticated;
GRANT ALL ON public.league_event_checkins TO service_role;

ALTER TABLE public.league_event_checkins ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS league_event_checkins_event_idx
  ON public.league_event_checkins (league_event_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS league_event_checkins_user_idx
  ON public.league_event_checkins (user_id, checked_in_at DESC);

DROP TRIGGER IF EXISTS trg_league_event_checkins_updated_at ON public.league_event_checkins;
CREATE TRIGGER trg_league_event_checkins_updated_at
  BEFORE UPDATE ON public.league_event_checkins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_manage_league(_league_id UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leagues l
    WHERE l.id = _league_id
      AND (
        l.owner_id = _user
        OR (l.club_id IS NOT NULL AND public.can_manage_club(l.club_id, _user))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_league(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_league(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_league(UUID, UUID) TO service_role;

CREATE POLICY "League check-ins readable by player or organizer"
  ON public.league_event_checkins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_league(league_id, auth.uid()));

CREATE POLICY "Organizers record league check-ins"
  ON public.league_event_checkins FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_league(league_id, auth.uid())
    OR (user_id = auth.uid() AND check_in_method = 'self')
  );

CREATE POLICY "Organizers update league check-ins"
  ON public.league_event_checkins FOR UPDATE TO authenticated
  USING (public.can_manage_league(league_id, auth.uid()))
  WITH CHECK (public.can_manage_league(league_id, auth.uid()));

CREATE POLICY "Organizers or player remove league check-in"
  ON public.league_event_checkins FOR DELETE TO authenticated
  USING (public.can_manage_league(league_id, auth.uid()) OR user_id = auth.uid());
