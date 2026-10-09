CREATE OR REPLACE FUNCTION public.director_registration_totals(_tournament_ids uuid[])
RETURNS TABLE (
  total bigint,
  pending bigint,
  confirmed bigint,
  waitlist bigint,
  checked_in bigint,
  withdrawn bigint,
  paid bigint,
  unpaid bigint,
  fees_collected_cents bigint,
  fees_outstanding_cents bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH r AS (
    SELECT
      tr.status,
      tr.payment_status,
      CASE
        WHEN td.id IS NOT NULL THEN COALESCE(td.entry_fee_cents, t.entry_fee_cents, 0)
        ELSE COALESCE(t.entry_fee_cents, 0)
      END AS fee
    FROM public.tournament_registrations tr
    JOIN public.tournaments t ON t.id = tr.tournament_id
    LEFT JOIN public.tournament_divisions td ON td.id = tr.division_id
    WHERE tr.tournament_id = ANY(_tournament_ids)
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE status = 'pending')::bigint,
    count(*) FILTER (WHERE status = 'confirmed')::bigint,
    count(*) FILTER (WHERE status = 'waitlist')::bigint,
    count(*) FILTER (WHERE status = 'checked_in')::bigint,
    count(*) FILTER (WHERE status = 'withdrawn')::bigint,
    count(*) FILTER (WHERE payment_status = 'paid')::bigint,
    count(*) FILTER (WHERE payment_status = 'unpaid' AND status <> 'withdrawn')::bigint,
    COALESCE(sum(fee) FILTER (WHERE payment_status = 'paid'), 0)::bigint,
    COALESCE(sum(fee) FILTER (WHERE payment_status = 'unpaid' AND status <> 'withdrawn'), 0)::bigint
  FROM r;
$function$;

GRANT EXECUTE ON FUNCTION public.director_registration_totals(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.director_registration_totals(uuid[]) TO service_role;

-- Prep checklists were world-readable; scope them to the crew that runs the event.
DROP POLICY IF EXISTS "Anyone views checklist" ON public.tournament_checklist_items;
CREATE POLICY "Event crew views checklist"
  ON public.tournament_checklist_items FOR SELECT
  TO authenticated
  USING (
    public.is_event_director(tournament_id, auth.uid())
    OR public.is_tournament_staff(tournament_id, auth.uid())
  );

-- Co-directors manage the checklist too, matching the app's own permission check.
DROP POLICY IF EXISTS "TD manages checklist" ON public.tournament_checklist_items;
CREATE POLICY "Directors manage checklist"
  ON public.tournament_checklist_items FOR ALL
  TO authenticated
  USING (public.is_event_director(tournament_id, auth.uid()))
  WITH CHECK (public.is_event_director(tournament_id, auth.uid()));

-- Co-directors can work the registrations desk for events they help run.
DROP POLICY IF EXISTS "Registrant or tournament owner views registrations" ON public.tournament_registrations;
CREATE POLICY "Registrant or event director views registrations"
  ON public.tournament_registrations FOR SELECT
  USING (user_id = auth.uid() OR public.is_event_director(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Player updates own registration" ON public.tournament_registrations;
CREATE POLICY "Player or event director updates registration"
  ON public.tournament_registrations FOR UPDATE
  USING (user_id = auth.uid() OR public.is_event_director(tournament_id, auth.uid()));

DROP POLICY IF EXISTS "Player or TD deletes registration" ON public.tournament_registrations;
CREATE POLICY "Player or event director deletes registration"
  ON public.tournament_registrations FOR DELETE
  USING (user_id = auth.uid() OR public.is_event_director(tournament_id, auth.uid()));