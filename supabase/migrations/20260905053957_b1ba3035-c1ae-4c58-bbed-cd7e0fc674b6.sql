-- Comments and likes must follow the parent post's visibility.
-- The EXISTS subquery is filtered by the posts table's own RLS policies, so
-- friends-only / club-only / hidden posts stay hidden along with their
-- comments and likes, with no duplicated visibility logic to drift.

DROP POLICY IF EXISTS comments_public_read ON public.comments;
CREATE POLICY comments_read_visible_posts
  ON public.comments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id)
  );

DROP POLICY IF EXISTS likes_public_read ON public.post_likes;
CREATE POLICY likes_read_visible_posts
  ON public.post_likes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_likes.post_id)
  );

-- Leaderboard RPCs are SECURITY DEFINER and only used by signed-in screens.
REVOKE EXECUTE ON FUNCTION public.progress_aces_leaderboard(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.progress_rounds_leaderboard(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.progress_aces_leaderboard(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.progress_rounds_leaderboard(integer) TO authenticated, service_role;