-- Per-hole detail
ALTER TABLE public.round_scores
  ADD COLUMN IF NOT EXISTS fairway_hit boolean,
  ADD COLUMN IF NOT EXISTS c1_putts integer,
  ADD COLUMN IF NOT EXISTS c2_putts integer,
  ADD COLUMN IF NOT EXISTS ob_strokes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hole_note text;

-- Let linked players write their own scores (not only the round creator)
DROP POLICY IF EXISTS "Round creator manages scores" ON public.round_scores;
CREATE POLICY "Round creator or linked player manages scores"
  ON public.round_scores
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_scores.round_id AND r.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.id = round_scores.round_player_id AND rp.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_scores.round_id AND r.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.id = round_scores.round_player_id AND rp.user_id = auth.uid())
  );

-- Same generosity for round_players insert (invited player can join themselves)
DROP POLICY IF EXISTS "Round creator manages players" ON public.round_players;
CREATE POLICY "Round creator or self manages participation"
  ON public.round_players
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_players.round_id AND r.created_by = auth.uid())
    OR round_players.user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_players.round_id AND r.created_by = auth.uid())
    OR round_players.user_id = auth.uid()
  );

-- Realtime for live scorecards
ALTER TABLE public.round_scores REPLICA IDENTITY FULL;
ALTER TABLE public.round_players REPLICA IDENTITY FULL;
ALTER TABLE public.rounds REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.round_scores; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.round_players; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Link posts back to a round so "share round" cards render nicely
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.rounds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_round_id_idx ON public.posts(round_id);
