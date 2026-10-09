-- 1. Split the posts read rule by audience so anonymous reads never touch are_friends()
DROP POLICY IF EXISTS "posts_read_visible" ON public.posts;

CREATE POLICY "posts_read_public_anon"
ON public.posts FOR SELECT
TO anon
USING (hidden_at IS NULL AND visibility = 'public'::post_visibility);

CREATE POLICY "posts_read_visible"
ON public.posts FOR SELECT
TO authenticated
USING (
  hidden_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.author_id)
       OR (b.blocker_id = posts.author_id AND b.blocked_id = auth.uid())
  )
  AND (
    author_id = auth.uid()
    OR visibility = 'public'::post_visibility
    OR (visibility = 'friends'::post_visibility AND auth.uid() IS NOT NULL AND public.are_friends(auth.uid(), author_id))
    OR (visibility = 'club'::post_visibility AND club_id IS NOT NULL AND auth.uid() IS NOT NULL AND public.is_club_member(club_id, auth.uid()))
  )
);

-- 2. Event Director flag is not sensitive and is read by the signed-in member's own client
GRANT SELECT (is_event_director) ON public.profiles TO authenticated;