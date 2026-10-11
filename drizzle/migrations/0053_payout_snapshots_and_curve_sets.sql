CREATE TABLE public.payout_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_kind text NOT NULL DEFAULT 'tournament' CHECK (event_kind IN ('tournament','league')),
  event_id uuid NOT NULL,
  division_id uuid,
  division_label text NOT NULL DEFAULT 'Open',
  snapshot jsonb NOT NULL,
  curve_version text NOT NULL,
  ruleset_version text,
  total_paid_cents integer NOT NULL DEFAULT 0,
  remainder_cents integer NOT NULL DEFAULT 0,
  remainder_destination text,
  finalized_by uuid NOT NULL DEFAULT auth.uid(),
  finalized_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  superseded_by uuid,
  superseded_reason text
);
CREATE INDEX payout_snapshots_event_idx ON public.payout_snapshots (event_id, division_id);
GRANT SELECT, INSERT ON public.payout_snapshots TO authenticated;
GRANT ALL ON public.payout_snapshots TO service_role;
ALTER TABLE public.payout_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Event managers read payout snapshots" ON public.payout_snapshots
  FOR SELECT TO authenticated USING (public.can_manage_event(event_kind, event_id, auth.uid()));
CREATE POLICY "Event managers finalize payouts" ON public.payout_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (finalized_by = auth.uid() AND superseded_at IS NULL AND public.can_manage_event(event_kind, event_id, auth.uid()));

-- One active (not superseded) snapshot per event division.
CREATE UNIQUE INDEX payout_snapshots_one_active ON public.payout_snapshots (event_id, COALESCE(division_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE superseded_at IS NULL;

-- Reopening keeps the old snapshot as history; only an event manager can do it, with a reason.
CREATE OR REPLACE FUNCTION public.reopen_payout_snapshot(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payout_snapshots;
BEGIN
  SELECT * INTO r FROM public.payout_snapshots WHERE id = _id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF NOT public.can_manage_event(r.event_kind, r.event_id, auth.uid()) THEN RAISE EXCEPTION 'Only this event''s directors can reopen payouts'; END IF;
  IF coalesce(length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'Add a short reason for reopening'; END IF;
  UPDATE public.payout_snapshots SET superseded_at = now(), superseded_by = auth.uid(), superseded_reason = trim(_reason)
  WHERE id = _id AND superseded_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.reopen_payout_snapshot(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reopen_payout_snapshot(uuid, text) TO authenticated;

CREATE TABLE public.payout_curve_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'PDGA',
  label text NOT NULL,
  curves jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
GRANT SELECT ON public.payout_curve_sets TO anon;
GRANT SELECT, INSERT, UPDATE ON public.payout_curve_sets TO authenticated;
GRANT ALL ON public.payout_curve_sets TO service_role;
ALTER TABLE public.payout_curve_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published curve sets are public" ON public.payout_curve_sets
  FOR SELECT TO anon, authenticated USING (status IN ('published','retired') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins add curve sets" ON public.payout_curve_sets
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update curve sets" ON public.payout_curve_sets
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Published curves never change; history keeps the exact numbers it used.
CREATE OR REPLACE FUNCTION public.guard_payout_curve_set() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.curves IS DISTINCT FROM OLD.curves OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'Published curve sets cannot be edited — add a new version instead';
  END IF;
  IF NEW.status = 'published' AND OLD.status = 'draft' THEN NEW.published_at := now(); END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN RAISE EXCEPTION 'Retired curve sets stay retired'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payout_curve_sets_guard BEFORE UPDATE ON public.payout_curve_sets FOR EACH ROW EXECUTE FUNCTION public.guard_payout_curve_set();