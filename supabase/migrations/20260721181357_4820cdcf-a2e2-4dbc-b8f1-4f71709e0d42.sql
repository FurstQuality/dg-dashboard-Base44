
-- Feed
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author_created_idx ON public.posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_club_created_idx ON public.posts (club_id, created_at DESC) WHERE club_id IS NOT NULL;

-- Notifications
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;

-- Post engagement
CREATE INDEX IF NOT EXISTS post_likes_post_idx ON public.post_likes (post_id);
CREATE INDEX IF NOT EXISTS post_likes_user_idx ON public.post_likes (user_id);
CREATE INDEX IF NOT EXISTS post_saves_user_idx ON public.post_saves (user_id);
CREATE INDEX IF NOT EXISTS comments_post_created_idx ON public.comments (post_id, created_at);

-- Messaging
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON public.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS conversations_last_message_idx ON public.conversations (last_message_at DESC);

-- Follows
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows (followee_id);

-- Courses & holes
CREATE INDEX IF NOT EXISTS holes_layout_number_idx ON public.holes (layout_id, number);
CREATE INDEX IF NOT EXISTS course_layouts_course_idx ON public.course_layouts (course_id);
CREATE INDEX IF NOT EXISTS course_features_layout_idx ON public.course_features (layout_id);
CREATE INDEX IF NOT EXISTS course_reviews_course_idx ON public.course_reviews (course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS courses_created_by_idx ON public.courses (created_by);

-- Rounds
CREATE INDEX IF NOT EXISTS rounds_created_by_started_idx ON public.rounds (created_by, started_at DESC);
CREATE INDEX IF NOT EXISTS round_players_round_idx ON public.round_players (round_id);
CREATE INDEX IF NOT EXISTS round_players_user_idx ON public.round_players (user_id);
CREATE INDEX IF NOT EXISTS round_scores_round_idx ON public.round_scores (round_id);
CREATE INDEX IF NOT EXISTS round_scores_player_hole_idx ON public.round_scores (round_player_id, hole_number);

-- Tournaments & leagues
CREATE INDEX IF NOT EXISTS tournament_registrations_tournament_idx ON public.tournament_registrations (tournament_id);
CREATE INDEX IF NOT EXISTS tournament_registrations_user_idx ON public.tournament_registrations (user_id);
CREATE INDEX IF NOT EXISTS tournament_rounds_tournament_idx ON public.tournament_rounds (tournament_id, round_number);
CREATE INDEX IF NOT EXISTS tournament_scores_round_reg_idx ON public.tournament_scores (round_id, registration_id);
CREATE INDEX IF NOT EXISTS tournament_divisions_tournament_idx ON public.tournament_divisions (tournament_id);
CREATE INDEX IF NOT EXISTS tournaments_start_idx ON public.tournaments (start_date DESC);
CREATE INDEX IF NOT EXISTS league_events_league_idx ON public.league_events (league_id, week_number);
CREATE INDEX IF NOT EXISTS league_registrations_league_idx ON public.league_registrations (league_id);

-- Clubs & external
CREATE INDEX IF NOT EXISTS club_members_club_idx ON public.club_members (club_id);
CREATE INDEX IF NOT EXISTS club_members_user_idx ON public.club_members (user_id);
CREATE INDEX IF NOT EXISTS external_rounds_user_played_idx ON public.external_rounds (user_id, played_on DESC);
