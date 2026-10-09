
-- =========================================================================
-- Security hardening: restrict overly-permissive SELECT policies, protect
-- private calendar feed tokens, and lock down internal SECURITY DEFINER
-- functions from anon/authenticated execution.
-- =========================================================================

-- 1. profiles.ics_feed_token — column-level lockdown --------------------
-- The public SELECT policy on profiles is intentional (public profiles),
-- but the ics_feed_token column is a private calendar feed secret. Revoke
-- column-level SELECT from anon and authenticated; server-side reads
-- (public calendar route + owner token issuance) go through supabaseAdmin.
REVOKE SELECT (ics_feed_token) ON public.profiles FROM anon;
REVOKE SELECT (ics_feed_token) ON public.profiles FROM authenticated;

-- 2. conversation_invites — restrict SELECT to creator / members --------
DROP POLICY IF EXISTS "Any signed-in user can look up invites" ON public.conversation_invites;

CREATE POLICY "Creator or conversation member views invites"
  ON public.conversation_invites
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_conversation_member(conversation_id, auth.uid())
  );

-- 3. external_rounds — owner-only reads ---------------------------------
DROP POLICY IF EXISTS "Anyone signed in views external rounds" ON public.external_rounds;

CREATE POLICY "Owner views external round"
  ON public.external_rounds
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. league_registrations — registrant or league owner ------------------
DROP POLICY IF EXISTS "Anyone views league regs" ON public.league_registrations;

CREATE POLICY "Registrant or league owner views registrations"
  ON public.league_registrations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = league_registrations.league_id
        AND l.owner_id = auth.uid()
    )
  );

-- 5. tournament_registrations — registrant or tournament owner ----------
DROP POLICY IF EXISTS "Anyone views registrations" ON public.tournament_registrations;

CREATE POLICY "Registrant or tournament owner views registrations"
  ON public.tournament_registrations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_registrations.tournament_id
        AND t.owner_id = auth.uid()
    )
  );

-- 6. user_progress — authenticated only (no anon leaderboard scraping) --
DROP POLICY IF EXISTS "progress readable by all" ON public.user_progress;

CREATE POLICY "Authenticated views progress"
  ON public.user_progress
  FOR SELECT
  TO authenticated
  USING (true);

-- 7. Lock down internal SECURITY DEFINER functions from client execution.
-- Keep EXECUTE for: has_role, is_conversation_member, friend_suggestions
-- (documented public RPCs). All other SECURITY DEFINER functions are
-- trigger bodies or server-side helpers only — no client should call them.
DO $$
DECLARE
  fn record;
  keep text[] := ARRAY['has_role','is_conversation_member','friend_suggestions'];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND NOT (p.proname = ANY(keep))
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      fn.proname, fn.args
    );
  END LOOP;
END $$;
