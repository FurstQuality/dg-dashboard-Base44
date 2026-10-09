ALTER TABLE public.external_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.round_ratings REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'external_rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.external_rounds;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'round_ratings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_ratings;
  END IF;
END $$;