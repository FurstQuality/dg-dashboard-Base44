
ALTER FUNCTION public.calc_level(integer) SET search_path = public;
ALTER FUNCTION public.level_title(integer) SET search_path = public;

REVOKE ALL ON FUNCTION public.award_xp(uuid,text,integer,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_achievement(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_challenge_progress(uuid,public.challenge_goal_type,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_streak(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_round_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_round_score_saved() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_post_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_comment_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_friendship_accepted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_course_approved() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_tournament_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_league_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_community_event_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_rsvp_change() FROM PUBLIC, anon, authenticated;
