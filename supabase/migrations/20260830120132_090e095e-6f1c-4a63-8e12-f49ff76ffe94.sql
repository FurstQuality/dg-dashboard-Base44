CREATE TABLE public.tournament_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'volunteer',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id),
  CONSTRAINT tournament_staff_role_chk CHECK (role IN ('co_td','scorekeeper','volunteer','spotter','media'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_staff TO authenticated;
GRANT ALL ON public.tournament_staff TO service_role;

ALTER TABLE public.tournament_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_tournament_staff(_tournament uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_staff s
    WHERE s.tournament_id = _tournament AND s.user_id = _user
  );
$$;

REVOKE ALL ON FUNCTION public.is_tournament_staff(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tournament_staff(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_event_director(_tournament uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = _tournament AND t.owner_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.tournament_staff s
    WHERE s.tournament_id = _tournament AND s.user_id = _user AND s.role = 'co_td'
  );
$$;

REVOKE ALL ON FUNCTION public.is_event_director(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_event_director(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Owners manage event staff"
  ON public.tournament_staff FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.owner_id = auth.uid()));

CREATE POLICY "Staff can read their own roster rows"
  ON public.tournament_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tournament_staff(tournament_id, auth.uid()));

CREATE INDEX tournament_staff_tournament_idx ON public.tournament_staff(tournament_id);
CREATE INDEX tournament_staff_user_idx ON public.tournament_staff(user_id);

CREATE TRIGGER tournament_staff_set_updated_at
  BEFORE UPDATE ON public.tournament_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.registration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  registration_id uuid,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.registration_audit TO authenticated;
GRANT ALL ON public.registration_audit TO service_role;

ALTER TABLE public.registration_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors read registration audit"
  ON public.registration_audit FOR SELECT TO authenticated
  USING (public.is_event_director(tournament_id, auth.uid()));

CREATE POLICY "Directors write registration audit"
  ON public.registration_audit FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.is_event_director(tournament_id, auth.uid()));

CREATE INDEX registration_audit_tournament_idx ON public.registration_audit(tournament_id, created_at DESC);
