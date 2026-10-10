CREATE OR REPLACE FUNCTION public.prize_can_manage(_kind text, _event uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN _kind = 'tournament' THEN public.can_manage_event('tournament', _event, _user)
    WHEN _kind = 'league_event' THEN EXISTS (
      SELECT 1 FROM public.league_events le WHERE le.id = _event AND public.can_manage_event('league', le.league_id, _user))
    WHEN _kind = 'league' THEN public.can_manage_event('league', _event, _user)
    WHEN _kind = 'series' THEN EXISTS (
      SELECT 1 FROM public.event_series s WHERE s.id = _event
        AND (s.owner_id = _user OR (s.club_id IS NOT NULL AND public.can_manage_club(s.club_id, _user))))
    ELSE false END
$$;
REVOKE ALL ON FUNCTION public.prize_can_manage(text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.prize_can_manage(text, uuid, uuid) TO authenticated;

CREATE TABLE public.event_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_kind text NOT NULL CHECK (event_kind IN ('tournament','league_event','series')),
  event_id uuid NOT NULL,
  fund_scope_kind text NOT NULL DEFAULT 'event' CHECK (fund_scope_kind IN ('event','league','series','organization')),
  fund_scope_id uuid,
  award_type text NOT NULL CHECK (award_type IN ('ace_fund','fifty_fifty','ctp','longest_putt','longest_drive','bonus','bounty','sponsor_prize','raffle','cash_prize','merchandise_prize','trophy','custom')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text,
  hole_number integer CHECK (hole_number BETWEEN 1 AND 99),
  division_eligibility text,
  sponsor_name text,
  value_kind text NOT NULL DEFAULT 'cash' CHECK (value_kind IN ('cash','merchandise','credit','trophy','other')),
  amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  cost numeric(10,2) CHECK (cost >= 0),
  payout_rule text NOT NULL DEFAULT 'winner_all' CHECK (payout_rule IN ('winner_all','split_equal','percent','carry_if_none','custom')),
  winner_percent numeric(5,2) NOT NULL DEFAULT 100 CHECK (winner_percent BETWEEN 0 AND 100),
  per_player numeric(10,2) NOT NULL DEFAULT 0 CHECK (per_player >= 0),
  contributors integer NOT NULL DEFAULT 0 CHECK (contributors >= 0),
  carryover_in numeric(10,2) NOT NULL DEFAULT 0 CHECK (carryover_in >= 0),
  added_cash numeric(10,2) NOT NULL DEFAULT 0 CHECK (added_cash >= 0),
  round_to_5 boolean NOT NULL DEFAULT false,
  remainder_action text NOT NULL DEFAULT 'carry_over' CHECK (remainder_action IN ('carry_over','ace_fund','league_fund','event_fund','next_event','another_prize','undistributed')),
  team_award boolean NOT NULL DEFAULT false,
  team_size integer NOT NULL DEFAULT 1 CHECK (team_size BETWEEN 1 AND 8),
  funding_source text CHECK (funding_source IN ('entry_fees','buy_in','sponsor','club','added_cash','donation','carryover','other')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','staff')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','available','awarded','paid','carried_over','cancelled')),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_prizes_event_idx ON public.event_prizes (event_kind, event_id);
CREATE INDEX event_prizes_scope_idx ON public.event_prizes (fund_scope_kind, fund_scope_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_prizes TO authenticated;
GRANT ALL ON public.event_prizes TO service_role;
ALTER TABLE public.event_prizes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Event staff manage prizes" ON public.event_prizes FOR ALL TO authenticated
  USING (public.prize_can_manage(event_kind, event_id, auth.uid()))
  WITH CHECK (public.prize_can_manage(event_kind, event_id, auth.uid()));

CREATE TABLE public.event_prize_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id uuid NOT NULL REFERENCES public.event_prizes(id) ON DELETE CASCADE,
  user_id uuid,
  recipient_name text NOT NULL CHECK (length(recipient_name) BETWEEN 1 AND 120),
  amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
CREATE INDEX event_prize_recipients_prize_idx ON public.event_prize_recipients (prize_id);
GRANT SELECT, INSERT, UPDATE ON public.event_prize_recipients TO authenticated;
GRANT ALL ON public.event_prize_recipients TO service_role;
ALTER TABLE public.event_prize_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Event staff read recipients" ON public.event_prize_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_prizes p WHERE p.id = prize_id AND public.prize_can_manage(p.event_kind, p.event_id, auth.uid())));
CREATE POLICY "Event staff add recipients" ON public.event_prize_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.event_prizes p WHERE p.id = prize_id AND public.prize_can_manage(p.event_kind, p.event_id, auth.uid())));
CREATE POLICY "Event staff update recipients" ON public.event_prize_recipients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_prizes p WHERE p.id = prize_id AND public.prize_can_manage(p.event_kind, p.event_id, auth.uid())));

CREATE TABLE public.event_prize_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id uuid NOT NULL,
  actor uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_prize_audit_prize_idx ON public.event_prize_audit (prize_id, at DESC);
GRANT SELECT ON public.event_prize_audit TO authenticated;
GRANT ALL ON public.event_prize_audit TO service_role;
ALTER TABLE public.event_prize_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Event staff read prize audit" ON public.event_prize_audit FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_prizes p WHERE p.id = prize_id AND public.prize_can_manage(p.event_kind, p.event_id, auth.uid())));

CREATE TABLE public.prize_fund_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind text NOT NULL CHECK (scope_kind IN ('league','series','organization')),
  scope_id uuid NOT NULL,
  fund_type text NOT NULL DEFAULT 'ace_fund',
  prize_id uuid REFERENCES public.event_prizes(id) ON DELETE SET NULL,
  entry_kind text NOT NULL CHECK (entry_kind IN ('opening','contribution','added','payout','correction')),
  amount numeric(10,2) NOT NULL,
  note text,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prize_fund_ledger_scope_idx ON public.prize_fund_ledger (scope_kind, scope_id, fund_type, created_at);
CREATE UNIQUE INDEX prize_fund_ledger_once ON public.prize_fund_ledger (prize_id, entry_kind) WHERE prize_id IS NOT NULL AND entry_kind <> 'correction';
GRANT SELECT, INSERT ON public.prize_fund_ledger TO authenticated;
GRANT ALL ON public.prize_fund_ledger TO service_role;
ALTER TABLE public.prize_fund_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fund staff read ledger" ON public.prize_fund_ledger FOR SELECT TO authenticated
  USING (public.prize_can_manage(CASE scope_kind WHEN 'league' THEN 'league' ELSE scope_kind END, scope_id, auth.uid()));
CREATE POLICY "Fund staff write ledger" ON public.prize_fund_ledger FOR INSERT TO authenticated
  WITH CHECK (scope_kind IN ('league','series') AND public.prize_can_manage(scope_kind, scope_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.event_prize_audit_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'event_prizes' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (NEW.id, auth.uid(), 'created', jsonb_build_object('name', NEW.name, 'amount', NEW.amount));
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.updated_at := now();
      IF NEW.amount IS DISTINCT FROM OLD.amount THEN
        INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (NEW.id, auth.uid(), 'amount_changed', jsonb_build_object('from', OLD.amount, 'to', NEW.amount));
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (NEW.id, auth.uid(), 'status_changed', jsonb_build_object('from', OLD.status, 'to', NEW.status));
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (OLD.id, auth.uid(), 'deleted', jsonb_build_object('name', OLD.name));
      RETURN OLD;
    END IF;
    RETURN NEW;
  ELSE
    IF TG_OP = 'INSERT' THEN
      INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (NEW.prize_id, auth.uid(), 'winner_assigned', jsonb_build_object('recipient', NEW.recipient_name, 'amount', NEW.amount));
    ELSE
      IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
        INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (NEW.prize_id, auth.uid(), 'winner_corrected', jsonb_build_object('recipient', OLD.recipient_name, 'reason', NEW.void_reason));
      END IF;
      IF NEW.paid AND NOT OLD.paid THEN
        INSERT INTO event_prize_audit(prize_id, actor, action, detail) VALUES (NEW.prize_id, auth.uid(), 'payout_recorded', jsonb_build_object('recipient', NEW.recipient_name, 'amount', NEW.amount));
      END IF;
      -- Recipient rows are corrected by voiding, never by rewriting who or how much.
      IF NEW.recipient_name IS DISTINCT FROM OLD.recipient_name OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Correct a winner by removing them and adding the right one.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER event_prizes_audit BEFORE INSERT OR UPDATE OR DELETE ON public.event_prizes FOR EACH ROW EXECUTE FUNCTION public.event_prize_audit_trg();
CREATE TRIGGER event_prize_recipients_audit BEFORE INSERT OR UPDATE ON public.event_prize_recipients FOR EACH ROW EXECUTE FUNCTION public.event_prize_audit_trg();

-- Public-safe winners: public prizes that were awarded, without internal cost.
CREATE OR REPLACE FUNCTION public.get_public_prize_winners(_kind text, _event uuid)
RETURNS TABLE (prize_id uuid, award_type text, name text, hole_number integer, sponsor_name text, value_kind text, recipient_name text, user_id uuid, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.award_type, p.name, p.hole_number, p.sponsor_name, p.value_kind, r.recipient_name, r.user_id, r.amount
  FROM event_prizes p JOIN event_prize_recipients r ON r.prize_id = p.id AND r.voided_at IS NULL
  WHERE p.event_kind = _kind AND p.event_id = _event AND p.visibility = 'public' AND p.status IN ('awarded','paid')
  ORDER BY p.created_at, r.created_at
$$;
GRANT EXECUTE ON FUNCTION public.get_public_prize_winners(text, uuid) TO anon, authenticated;