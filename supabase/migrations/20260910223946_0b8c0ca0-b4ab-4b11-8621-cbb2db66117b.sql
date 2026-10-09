-- Who controls permissions for a league/tournament: the club (when assigned) else the creator.
CREATE TABLE public.event_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('league','tournament')),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  access_level text NOT NULL DEFAULT 'manage' CHECK (access_level IN ('manage','score')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, event_id, user_id)
);
CREATE INDEX event_managers_user_idx ON public.event_managers (user_id, kind);
CREATE INDEX event_managers_event_idx ON public.event_managers (kind, event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_managers TO authenticated;
GRANT SELECT ON public.event_managers TO anon;
GRANT ALL ON public.event_managers TO service_role;

CREATE TABLE public.event_manager_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('league','tournament')),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX event_manager_requests_one_pending
  ON public.event_manager_requests (kind, event_id, user_id)
  WHERE status = 'pending';
CREATE INDEX event_manager_requests_event_idx ON public.event_manager_requests (kind, event_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_manager_requests TO authenticated;
GRANT ALL ON public.event_manager_requests TO service_role;

CREATE TRIGGER event_managers_touch BEFORE UPDATE ON public.event_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER event_manager_requests_touch BEFORE UPDATE ON public.event_manager_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Controls permissions: club owner/admin when the event belongs to a club, else the creator.
CREATE OR REPLACE FUNCTION public.controls_event_access(_kind text, _event uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN public.has_role(_user,'admin') OR public.has_role(_user,'super_admin') THEN true
    WHEN _kind = 'league' THEN EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = _event
        AND CASE WHEN l.club_id IS NOT NULL
                 THEN public.can_manage_club(l.club_id, _user)
                 ELSE l.owner_id = _user END
    )
    WHEN _kind = 'tournament' THEN EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = _event
        AND CASE WHEN t.club_id IS NOT NULL
                 THEN public.can_manage_club(t.club_id, _user)
                 ELSE t.owner_id = _user END
    )
    ELSE false
  END;
$$;

-- Full management rights: controller, creator, granted manager, or tournament staff.
CREATE OR REPLACE FUNCTION public.can_manage_event(_kind text, _event uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _user IS NULL THEN false ELSE
    public.controls_event_access(_kind, _event, _user)
    OR (_kind = 'league' AND EXISTS (
      SELECT 1 FROM public.leagues l WHERE l.id = _event AND l.owner_id = _user))
    OR (_kind = 'tournament' AND EXISTS (
      SELECT 1 FROM public.tournaments t WHERE t.id = _event AND t.owner_id = _user))
    OR EXISTS (
      SELECT 1 FROM public.event_managers m
      WHERE m.kind = _kind AND m.event_id = _event
        AND m.user_id = _user AND m.access_level = 'manage')
    OR (_kind = 'tournament' AND public.is_tournament_staff(_event, _user))
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_league(_league_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_event('league', _league_id, _user);
$$;

REVOKE EXECUTE ON FUNCTION public.controls_event_access(text, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_event(text, uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.controls_event_access(text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_event(text, uuid, uuid) TO authenticated, service_role;

-- Managers may not reassign ownership or move the event between clubs.
CREATE OR REPLACE FUNCTION public.guard_event_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind text := CASE TG_TABLE_NAME WHEN 'leagues' THEN 'league' ELSE 'tournament' END;
BEGIN
  IF (NEW.owner_id IS DISTINCT FROM OLD.owner_id
      OR NEW.club_id IS DISTINCT FROM OLD.club_id)
     AND NOT public.controls_event_access(_kind, OLD.id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the owner or club admins can change who runs this event';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leagues_guard_ownership BEFORE UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_ownership_change();
CREATE TRIGGER tournaments_guard_ownership BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_ownership_change();

-- RLS for the new tables
ALTER TABLE public.event_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can see who manages an event" ON public.event_managers
  FOR SELECT USING (true);
CREATE POLICY "Controllers add managers" ON public.event_managers
  FOR INSERT TO authenticated
  WITH CHECK (public.controls_event_access(kind, event_id, auth.uid()));
CREATE POLICY "Controllers change manager access" ON public.event_managers
  FOR UPDATE TO authenticated
  USING (public.controls_event_access(kind, event_id, auth.uid()))
  WITH CHECK (public.controls_event_access(kind, event_id, auth.uid()));
CREATE POLICY "Controllers or the manager can remove access" ON public.event_managers
  FOR DELETE TO authenticated
  USING (public.controls_event_access(kind, event_id, auth.uid()) OR user_id = auth.uid());

ALTER TABLE public.event_manager_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requesters and controllers read requests" ON public.event_manager_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.controls_event_access(kind, event_id, auth.uid()));
CREATE POLICY "Users ask to manage an event" ON public.event_manager_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Requesters withdraw and controllers decide" ON public.event_manager_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.controls_event_access(kind, event_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.controls_event_access(kind, event_id, auth.uid()));
CREATE POLICY "Requesters delete their own request" ON public.event_manager_requests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Broaden management on leagues/tournaments and their child records.
DROP POLICY IF EXISTS "Owner updates league" ON public.leagues;
CREATE POLICY "Managers update league" ON public.leagues
  FOR UPDATE TO authenticated
  USING (public.can_manage_event('league', id, auth.uid()))
  WITH CHECK (public.can_manage_event('league', id, auth.uid()));

DROP POLICY IF EXISTS "Owner deletes league" ON public.leagues;
CREATE POLICY "Controllers delete league" ON public.leagues
  FOR DELETE TO authenticated
  USING (public.controls_event_access('league', id, auth.uid()));

DROP POLICY IF EXISTS "Anyone views leagues" ON public.leagues;
CREATE POLICY "Anyone views leagues" ON public.leagues
  FOR SELECT USING (status <> 'draft'::league_status OR public.can_manage_event('league', id, auth.uid()));

DROP POLICY IF EXISTS "TDs update own tournaments" ON public.tournaments;
CREATE POLICY "Managers update tournament" ON public.tournaments
  FOR UPDATE TO authenticated
  USING (public.can_manage_event('tournament', id, auth.uid()))
  WITH CHECK (public.can_manage_event('tournament', id, auth.uid()));

DROP POLICY IF EXISTS "TDs delete own tournaments" ON public.tournaments;
CREATE POLICY "Controllers delete tournament" ON public.tournaments
  FOR DELETE TO authenticated
  USING (public.controls_event_access('tournament', id, auth.uid()));

DROP POLICY IF EXISTS "Anyone can view non-draft tournaments" ON public.tournaments;
CREATE POLICY "Anyone can view non-draft tournaments" ON public.tournaments
  FOR SELECT USING (status <> 'draft'::tournament_status OR public.can_manage_event('tournament', id, auth.uid()));

DROP POLICY IF EXISTS "Owner manages league events" ON public.league_events;
CREATE POLICY "Managers manage league events" ON public.league_events
  FOR ALL TO authenticated
  USING (public.can_manage_event('league', league_id, auth.uid()))
  WITH CHECK (public.can_manage_event('league', league_id, auth.uid()));

DROP POLICY IF EXISTS "TD manages league divisions" ON public.league_divisions;
CREATE POLICY "Managers manage league divisions" ON public.league_divisions
  FOR ALL TO authenticated
  USING (public.can_manage_event('league', league_id, auth.uid()))
  WITH CHECK (public.can_manage_event('league', league_id, auth.uid()));

DROP POLICY IF EXISTS "TD manages divisions" ON public.tournament_divisions;
CREATE POLICY "Managers manage tournament divisions" ON public.tournament_divisions
  FOR ALL TO authenticated
  USING (public.can_manage_event('tournament', tournament_id, auth.uid()))
  WITH CHECK (public.can_manage_event('tournament', tournament_id, auth.uid()));

DROP POLICY IF EXISTS "TD manages rounds" ON public.tournament_rounds;
CREATE POLICY "Managers manage tournament rounds" ON public.tournament_rounds
  FOR ALL TO authenticated
  USING (public.can_manage_event('tournament', tournament_id, auth.uid()))
  WITH CHECK (public.can_manage_event('tournament', tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Owners manage event staff" ON public.tournament_staff;
CREATE POLICY "Controllers manage event staff" ON public.tournament_staff
  FOR ALL TO authenticated
  USING (public.controls_event_access('tournament', tournament_id, auth.uid()))
  WITH CHECK (public.controls_event_access('tournament', tournament_id, auth.uid()));