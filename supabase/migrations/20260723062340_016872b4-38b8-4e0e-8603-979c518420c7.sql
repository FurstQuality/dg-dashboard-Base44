
-- Social / messaging
CREATE INDEX IF NOT EXISTS comments_author_idx ON public.comments(author_id);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations(created_by);
CREATE INDEX IF NOT EXISTS conversation_invites_conv_idx ON public.conversation_invites(conversation_id);
CREATE INDEX IF NOT EXISTS notifications_actor_idx ON public.notifications(actor_id);
CREATE INDEX IF NOT EXISTS notifications_post_idx ON public.notifications(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_comment_idx ON public.notifications(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS caddy_messages_user_idx ON public.caddy_messages(user_id);

-- Courses / holes
CREATE INDEX IF NOT EXISTS course_features_created_by_idx ON public.course_features(created_by);
CREATE INDEX IF NOT EXISTS course_edit_requests_course_idx ON public.course_edit_requests(course_id);
CREATE INDEX IF NOT EXISTS course_reviews_user_idx ON public.course_reviews(user_id);
CREATE INDEX IF NOT EXISTS hole_media_created_by_idx ON public.hole_media(created_by);

-- Tournaments / leagues
CREATE INDEX IF NOT EXISTS tournaments_owner_idx ON public.tournaments(owner_id);
CREATE INDEX IF NOT EXISTS tournaments_course_idx ON public.tournaments(course_id);
CREATE INDEX IF NOT EXISTS tournaments_club_idx ON public.tournaments(club_id);
CREATE INDEX IF NOT EXISTS tournaments_layout_idx ON public.tournaments(layout_id);
CREATE INDEX IF NOT EXISTS tournament_rounds_course_idx ON public.tournament_rounds(course_id);
CREATE INDEX IF NOT EXISTS tournament_rounds_layout_idx ON public.tournament_rounds(layout_id);
CREATE INDEX IF NOT EXISTS tournament_registrations_division_idx ON public.tournament_registrations(division_id);
CREATE INDEX IF NOT EXISTS tournament_scores_registration_idx ON public.tournament_scores(registration_id);
CREATE INDEX IF NOT EXISTS leagues_owner_idx ON public.leagues(owner_id);
CREATE INDEX IF NOT EXISTS leagues_course_idx ON public.leagues(course_id);
CREATE INDEX IF NOT EXISTS leagues_club_idx ON public.leagues(club_id);
CREATE INDEX IF NOT EXISTS leagues_layout_idx ON public.leagues(layout_id);
CREATE INDEX IF NOT EXISTS league_events_course_idx ON public.league_events(course_id);
CREATE INDEX IF NOT EXISTS league_registrations_user_idx ON public.league_registrations(user_id);

-- Community
CREATE INDEX IF NOT EXISTS community_events_course_idx ON public.community_events(course_id);
CREATE INDEX IF NOT EXISTS community_events_host_idx ON public.community_events(host_id);
CREATE INDEX IF NOT EXISTS event_rsvps_user_idx ON public.event_rsvps(user_id);

-- Rounds / scoring
CREATE INDEX IF NOT EXISTS round_ratings_round_player_idx ON public.round_ratings(round_player_id) WHERE round_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rounds_layout_idx ON public.rounds(layout_id) WHERE layout_id IS NOT NULL;

-- Bag / range
CREATE INDEX IF NOT EXISTS user_discs_mold_idx ON public.user_discs(mold_id);
CREATE INDEX IF NOT EXISTS user_discs_plastic_idx ON public.user_discs(plastic_id) WHERE plastic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS range_throws_mold_idx ON public.range_throws(mold_id) WHERE mold_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS range_throws_disc_idx ON public.range_throws(disc_id) WHERE disc_id IS NOT NULL;

-- Scheduling
CREATE INDEX IF NOT EXISTS scheduled_events_tournament_idx ON public.scheduled_events(tournament_id) WHERE tournament_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scheduled_events_league_idx ON public.scheduled_events(league_id) WHERE league_id IS NOT NULL;

-- Goals / invites
CREATE INDEX IF NOT EXISTS user_goals_user_idx ON public.user_goals(user_id);
CREATE INDEX IF NOT EXISTS pdga_friend_invites_joined_user_idx ON public.pdga_friend_invites(joined_user_id) WHERE joined_user_id IS NOT NULL;
