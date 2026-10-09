
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS snapshot jsonb;

ALTER TABLE public.post_likes ADD COLUMN IF NOT EXISTS reaction text NOT NULL DEFAULT 'like';
CREATE INDEX IF NOT EXISTS post_likes_reaction_idx ON public.post_likes(post_id, reaction);

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS payout_plan jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tournament_scores'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_scores';
  END IF;
END $$;
