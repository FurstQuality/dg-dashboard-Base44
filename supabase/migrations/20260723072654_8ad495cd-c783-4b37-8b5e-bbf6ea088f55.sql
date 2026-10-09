
DROP POLICY IF EXISTS "Round creator or linked player manages scores" ON public.round_scores;

CREATE POLICY "Card players manage all scores in round"
ON public.round_scores
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_scores.round_id AND r.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = round_scores.round_id AND rp.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_scores.round_id AND r.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = round_scores.round_id AND rp.user_id = auth.uid())
);

ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS tournament_round_id uuid REFERENCES public.tournament_rounds(id) ON DELETE SET NULL;
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS league_event_id uuid REFERENCES public.league_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rounds_tournament_id_idx ON public.rounds (tournament_id);
CREATE INDEX IF NOT EXISTS rounds_league_event_id_idx ON public.rounds (league_event_id);
