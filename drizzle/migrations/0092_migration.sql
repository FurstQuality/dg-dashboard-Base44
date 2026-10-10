
CREATE TABLE public.event_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_announcements_t_idx ON public.event_announcements (tournament_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.event_announcements TO authenticated;
GRANT ALL ON public.event_announcements TO service_role;
ALTER TABLE public.event_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Field and staff read announcements" ON public.event_announcements FOR SELECT TO authenticated
  USING (public.can_enter_event_clubhouse(tournament_id) OR public.is_tournament_staff(tournament_id, auth.uid()));
CREATE POLICY "Directors and staff post announcements" ON public.event_announcements FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.is_event_director(tournament_id, auth.uid()) OR public.is_tournament_staff(tournament_id, auth.uid())));
CREATE POLICY "Directors and staff remove announcements" ON public.event_announcements FOR DELETE TO authenticated
  USING (public.is_event_director(tournament_id, auth.uid()) OR public.is_tournament_staff(tournament_id, auth.uid()));

CREATE TABLE public.event_card_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.tournament_registrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  card_label text NOT NULL CHECK (char_length(btrim(card_label)) BETWEEN 1 AND 40),
  starting_hole int CHECK (starting_hole BETWEEN 1 AND 99),
  tee_time timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, registration_id)
);
CREATE INDEX event_card_assignments_t_idx ON public.event_card_assignments (tournament_id, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_card_assignments TO authenticated;
GRANT ALL ON public.event_card_assignments TO service_role;
ALTER TABLE public.event_card_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Field and staff read cards" ON public.event_card_assignments FOR SELECT TO authenticated
  USING (public.can_enter_event_clubhouse(tournament_id) OR public.is_tournament_staff(tournament_id, auth.uid()));
CREATE POLICY "Directors and staff manage cards" ON public.event_card_assignments FOR ALL TO authenticated
  USING (public.is_event_director(tournament_id, auth.uid()) OR public.is_tournament_staff(tournament_id, auth.uid()))
  WITH CHECK (public.is_event_director(tournament_id, auth.uid()) OR public.is_tournament_staff(tournament_id, auth.uid()));

-- Registered players get the live scoring code for their event without seeing the director's code list.
CREATE OR REPLACE FUNCTION public.my_event_scoring_code(_tournament_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.code FROM event_join_codes c
  WHERE c.tournament_id = _tournament_id AND c.is_active
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (c.max_uses IS NULL OR c.use_count < c.max_uses)
    AND public.can_enter_event_clubhouse(_tournament_id)
  ORDER BY c.created_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.my_event_scoring_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_event_scoring_code(uuid) TO authenticated;

CREATE TABLE public.clubhouse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reported_user_id uuid NOT NULL,
  room_key text NOT NULL CHECK (char_length(room_key) <= 80),
  reason text NOT NULL CHECK (reason IN ('harassment','spam','inappropriate','other')),
  note text CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);
GRANT SELECT, INSERT ON public.clubhouse_reports TO authenticated;
GRANT UPDATE (status) ON public.clubhouse_reports TO authenticated;
GRANT ALL ON public.clubhouse_reports TO service_role;
ALTER TABLE public.clubhouse_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players file reports" ON public.clubhouse_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Reporters and admins read reports" ON public.clubhouse_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins review reports" ON public.clubhouse_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
