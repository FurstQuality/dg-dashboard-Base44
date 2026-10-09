-- 1. Round mode
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS is_rated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rating_mode text NOT NULL DEFAULT 'dgd_rated';

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_rating_mode_check;
ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_rating_mode_check CHECK (rating_mode IN ('dgd_rated','casual'));

-- 2. Per-hole score confirmations
CREATE TABLE IF NOT EXISTS public.round_score_confirmations (
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL REFERENCES public.round_players(id) ON DELETE CASCADE,
  hole_number int NOT NULL,
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strokes int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, round_player_id, hole_number, confirmed_by)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_score_confirmations TO authenticated;
GRANT ALL ON public.round_score_confirmations TO service_role;

ALTER TABLE public.round_score_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_members_read_confirmations" ON public.round_score_confirmations;
CREATE POLICY "card_members_read_confirmations" ON public.round_score_confirmations
  FOR SELECT TO authenticated
  USING (public.is_round_participant(round_id, auth.uid()));

DROP POLICY IF EXISTS "card_members_write_confirmations" ON public.round_score_confirmations;
CREATE POLICY "card_members_write_confirmations" ON public.round_score_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = confirmed_by AND public.is_round_participant(round_id, auth.uid()));

DROP POLICY IF EXISTS "card_members_delete_confirmations" ON public.round_score_confirmations;
CREATE POLICY "card_members_delete_confirmations" ON public.round_score_confirmations
  FOR DELETE TO authenticated
  USING (auth.uid() = confirmed_by);

-- 3. Abandonment penalties
CREATE TABLE IF NOT EXISTS public.round_abandonment_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.round_abandonment_penalties TO authenticated;
GRANT ALL ON public.round_abandonment_penalties TO service_role;

ALTER TABLE public.round_abandonment_penalties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_penalties_read" ON public.round_abandonment_penalties;
CREATE POLICY "own_penalties_read" ON public.round_abandonment_penalties
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "participants_insert_penalties" ON public.round_abandonment_penalties;
CREATE POLICY "participants_insert_penalties" ON public.round_abandonment_penalties
  FOR INSERT TO authenticated
  WITH CHECK (public.is_round_participant(round_id, auth.uid()));

-- Realtime for confirmations so cardmates see conflicts live
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_score_confirmations;