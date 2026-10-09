-- Restrict follows social graph to authenticated users only
DROP POLICY IF EXISTS "follows_public_read" ON public.follows;
CREATE POLICY "follows_authenticated_read"
  ON public.follows FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.follows FROM anon;

-- Restrict scraped PDGA player directories to authenticated users
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('pdga_players','pdga_kb_players')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "pdga_players_authenticated_read"
  ON public.pdga_players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "pdga_kb_players_authenticated_read"
  ON public.pdga_kb_players FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.pdga_players FROM anon;
REVOKE SELECT ON public.pdga_kb_players FROM anon;