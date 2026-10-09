DROP POLICY IF EXISTS follows_authenticated_read ON public.follows;
CREATE POLICY follows_read_unblocked ON public.follows FOR SELECT TO authenticated
USING (
  follower_id = auth.uid() OR followee_id = auth.uid() OR NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (follows.follower_id, follows.followee_id))
       OR (b.blocked_id = auth.uid() AND b.blocker_id IN (follows.follower_id, follows.followee_id))
  )
);

DROP POLICY IF EXISTS comment_likes_read ON public.comment_likes;
CREATE POLICY comment_likes_read_visible ON public.comment_likes FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.comments c WHERE c.id = comment_likes.comment_id AND public.can_view_post(c.post_id)
  )
);

DROP POLICY IF EXISTS features_read_auth ON public.feature_flags;
CREATE POLICY features_read_active ON public.feature_flags FOR SELECT TO authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'super_admin'::app_role));