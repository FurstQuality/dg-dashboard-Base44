CREATE TABLE public.kiosk_guest_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_kind text NOT NULL CHECK (event_kind IN ('tournament','league_event')),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  league_event_id uuid REFERENCES public.league_events(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  pdga_number text,
  division_name text,
  payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  payment_method text,
  notes text,
  signup_opt_in boolean NOT NULL DEFAULT false,
  signup_email_sent_at timestamptz,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiosk_guest_target CHECK (
    (event_kind = 'tournament' AND tournament_id IS NOT NULL)
    OR (event_kind = 'league_event' AND league_event_id IS NOT NULL AND league_id IS NOT NULL)
  )
);

CREATE INDEX kiosk_guest_checkins_tournament_idx ON public.kiosk_guest_checkins(tournament_id, created_at DESC);
CREATE INDEX kiosk_guest_checkins_league_event_idx ON public.kiosk_guest_checkins(league_event_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiosk_guest_checkins TO authenticated;
GRANT ALL ON public.kiosk_guest_checkins TO service_role;

ALTER TABLE public.kiosk_guest_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event staff can view kiosk guest check-ins"
  ON public.kiosk_guest_checkins FOR SELECT TO authenticated
  USING (
    (tournament_id IS NOT NULL AND (
      public.is_event_director(tournament_id, auth.uid())
      OR public.is_tournament_staff(tournament_id, auth.uid())
    ))
    OR (league_id IS NOT NULL AND public.can_manage_league(league_id, auth.uid()))
  );

CREATE POLICY "Event staff can add kiosk guest check-ins"
  ON public.kiosk_guest_checkins FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (tournament_id IS NOT NULL AND (
        public.is_event_director(tournament_id, auth.uid())
        OR public.is_tournament_staff(tournament_id, auth.uid())
      ))
      OR (league_id IS NOT NULL AND public.can_manage_league(league_id, auth.uid()))
    )
  );

CREATE POLICY "Event staff can update kiosk guest check-ins"
  ON public.kiosk_guest_checkins FOR UPDATE TO authenticated
  USING (
    (tournament_id IS NOT NULL AND (
      public.is_event_director(tournament_id, auth.uid())
      OR public.is_tournament_staff(tournament_id, auth.uid())
    ))
    OR (league_id IS NOT NULL AND public.can_manage_league(league_id, auth.uid()))
  );

CREATE POLICY "Event staff can remove kiosk guest check-ins"
  ON public.kiosk_guest_checkins FOR DELETE TO authenticated
  USING (
    (tournament_id IS NOT NULL AND public.is_event_director(tournament_id, auth.uid()))
    OR (league_id IS NOT NULL AND public.can_manage_league(league_id, auth.uid()))
  );

CREATE TRIGGER kiosk_guest_checkins_updated_at
  BEFORE UPDATE ON public.kiosk_guest_checkins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();