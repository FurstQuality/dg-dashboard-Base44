
-- Tighten notifications INSERT: only allow inserting rows for self, or via service_role/triggers
DROP POLICY IF EXISTS notif_insert_auth ON public.notifications;
CREATE POLICY notif_insert_self ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Revoke public EXECUTE on SECURITY DEFINER functions. Triggers still run regardless of grants.
REVOKE EXECUTE ON FUNCTION public.add_club_owner_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_achievement(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_challenge_progress(uuid, challenge_goal_type, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_course_moderation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_starter_wardrobe(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_avatar_saved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_comment_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_community_event_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_course_approved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_friendship_accepted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_league_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_post_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_round_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_round_score_saved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_rsvp_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_tournament_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_user_disc_added() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_streak(uuid) FROM PUBLIC, anon, authenticated;

-- Keep signed-in access for RPCs that the client legitimately calls
GRANT EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;
