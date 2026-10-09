-- Lock down internal SECURITY DEFINER functions from direct execution by authenticated users.
-- Trigger functions and internal reward helpers should never be callable via PostgREST.

REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, text, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_achievement(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_challenge_progress(uuid, challenge_goal_type, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_streak(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_starter_wardrobe(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_chainlink_from_par(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- Trigger functions are only invoked by the database engine; no client should run them directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_club_owner_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_course_moderation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_pdga_friend_invites() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_preset_usage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_comment_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_community_event_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_course_approved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_friendship_accepted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_league_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_post_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_round_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_round_score_saved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_round_score_shot_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_rsvp_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_tournament_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_user_disc_added() FROM PUBLIC, anon, authenticated;