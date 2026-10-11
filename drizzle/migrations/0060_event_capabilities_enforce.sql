INSERT INTO public.event_role_capabilities (staff_role, capability) VALUES
 ('co_td','event.manage_volunteers'),('co_td','event.manage_promotion')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.event_has_capability(_kind text, _event uuid, _user uuid, _cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN public.event_owner_id(_kind, _event) = _user THEN true
    WHEN public.has_role(_user, 'super_admin') THEN true
    WHEN public.is_owner_only_capability(_cap) THEN false
    WHEN EXISTS (SELECT 1 FROM public.event_managers m
                 WHERE m.kind = _kind AND m.event_id = _event AND m.user_id = _user) THEN EXISTS (
      SELECT 1 FROM public.event_managers m
      WHERE m.kind = _kind AND m.event_id = _event AND m.user_id = _user
        AND NOT (_cap = ANY (m.revoked_capabilities))
        AND (_cap = ANY (m.extra_capabilities) OR EXISTS (
          SELECT 1 FROM public.event_role_capabilities rc
          WHERE rc.staff_role = m.staff_role AND rc.capability = _cap)))
    -- Hosting-club admins and legacy tournament staff act as Co-TD (never owner-only).
    WHEN public.controls_event_access(_kind, _event, _user)
      OR (_kind = 'tournament' AND public.is_tournament_staff(_event, _user)) THEN EXISTS (
      SELECT 1 FROM public.event_role_capabilities rc WHERE rc.staff_role = 'co_td' AND rc.capability = _cap)
    ELSE false
  END
$$;

DROP POLICY "Event team posts alerts" ON public.event_alerts;
CREATE POLICY "Event team posts alerts" ON public.event_alerts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.send_announcements'));
DROP POLICY "Event team updates alerts" ON public.event_alerts;
CREATE POLICY "Event team updates alerts" ON public.event_alerts FOR UPDATE TO authenticated
  USING (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.send_announcements'))
  WITH CHECK (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.send_announcements'));
DROP POLICY "Event team deletes alerts" ON public.event_alerts;
CREATE POLICY "Event team deletes alerts" ON public.event_alerts FOR DELETE TO authenticated
  USING (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.send_announcements'));

DROP POLICY "Team creates tasks" ON public.event_volunteer_tasks;
CREATE POLICY "Team creates tasks" ON public.event_volunteer_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_volunteers'));
DROP POLICY "Team deletes tasks" ON public.event_volunteer_tasks;
CREATE POLICY "Team deletes tasks" ON public.event_volunteer_tasks FOR DELETE TO authenticated
  USING (public.event_has_capability('tournament', tournament_id, auth.uid(), 'event.manage_volunteers'));

DROP POLICY "Event managers finalize payouts" ON public.payout_snapshots;
CREATE POLICY "Event managers finalize payouts" ON public.payout_snapshots FOR INSERT TO authenticated
  WITH CHECK (finalized_by = auth.uid() AND superseded_at IS NULL AND public.event_has_capability(event_kind, event_id, auth.uid(), 'event.manage_finance'));
DROP POLICY "Event managers read payout snapshots" ON public.payout_snapshots;
CREATE POLICY "Event managers read payout snapshots" ON public.payout_snapshots FOR SELECT TO authenticated
  USING (public.event_has_capability(event_kind, event_id, auth.uid(), 'event.manage_finance')
      OR public.event_has_capability(event_kind, event_id, auth.uid(), 'event.view_private'));

DROP POLICY "Event staff manage prizes" ON public.event_prizes;
CREATE POLICY "Event staff manage prizes" ON public.event_prizes FOR ALL TO authenticated
  USING (public.event_has_capability(event_kind, event_id, auth.uid(), 'event.manage_finance'))
  WITH CHECK (public.event_has_capability(event_kind, event_id, auth.uid(), 'event.manage_finance'));