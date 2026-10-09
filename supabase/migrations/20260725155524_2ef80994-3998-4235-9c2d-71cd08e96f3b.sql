-- Lock down public profile access: anon can only see non-sensitive columns;
-- ics_feed_token (private calendar secret) is service-role only for everyone.

-- 1) ICS feed token: never expose over the Data API. Server code uses the
-- service-role client (see calendar-sync.functions.ts).
REVOKE SELECT (ics_feed_token) ON public.profiles FROM anon, authenticated;
REVOKE UPDATE (ics_feed_token) ON public.profiles FROM anon, authenticated;

-- 2) Anonymous visitors: strip all-column SELECT, then grant only the safe
-- public-identity columns. Location, home_state, bag, and calendar sharing
-- flags require authentication.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id, username, display_name, bio, avatar_url, cover_url,
  home_course, pdga_number, pdga_rating,
  favorite_ace, ace_count_manual, player_since,
  created_at, updated_at
) ON public.profiles TO anon;

-- 3) Authenticated users keep table-level SELECT (RLS still restricts rows),
-- minus ics_feed_token which was revoked above.
-- No change needed to policies or grants beyond the column revoke above.