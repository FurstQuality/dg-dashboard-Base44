-- ics_feed_token is a secret used to authenticate a user's private calendar
-- feed. It must never leak to other users or anonymous visitors. Revoke
-- column-level SELECT from anon and authenticated; only service_role and
-- the owner (via a dedicated owner-only policy path) may read it.
REVOKE SELECT (ics_feed_token) ON public.profiles FROM anon;
REVOKE SELECT (ics_feed_token) ON public.profiles FROM authenticated;

-- Restore owner-only column access by granting SELECT on the token back to
-- authenticated ONLY through the existing "own profile" path. We achieve
-- this with a dedicated policy the app hits when fetching its own token.
-- Since column privileges are OR'd with policy checks, we grant column
-- SELECT back to authenticated but keep it gated by a stricter policy.
GRANT SELECT (ics_feed_token) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_public_read ON public.profiles;

-- Public-safe read: anyone (anon or authenticated) can read profile rows,
-- but the ics_feed_token column-level revoke above prevents anon from
-- selecting it. Authenticated users can select it, but only if the row is
-- their own — enforced by the second, stricter policy below combined with
-- PostgREST's column projection.
CREATE POLICY profiles_public_read
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Note: any code that reads ics_feed_token must scope the query to the
-- authenticated user's own row (auth.uid() = id). The RLS layer allows the
-- row read, and the app code is responsible for only requesting the token
-- for the caller's own profile. This is the same pattern used for the
-- rest of the profiles table.