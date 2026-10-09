CREATE OR REPLACE FUNCTION public.can_view_post(_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    WHERE p.id = _post_id
      AND p.hidden_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = auth.uid())
      )
      AND (
        p.author_id = auth.uid()
        OR p.visibility = 'public'::post_visibility
        OR (p.visibility = 'friends'::post_visibility AND auth.uid() IS NOT NULL AND public.are_friends(auth.uid(), p.author_id))
        OR (p.visibility = 'club'::post_visibility AND p.club_id IS NOT NULL AND auth.uid() IS NOT NULL AND public.is_club_member(p.club_id, auth.uid()))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_post(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS comments_read_visible_posts ON public.comments;
CREATE POLICY comments_read_visible_posts
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (public.can_view_post(post_id));

DROP POLICY IF EXISTS likes_read_visible_posts ON public.post_likes;
CREATE POLICY likes_read_visible_posts
  ON public.post_likes FOR SELECT
  TO anon, authenticated
  USING (public.can_view_post(post_id));