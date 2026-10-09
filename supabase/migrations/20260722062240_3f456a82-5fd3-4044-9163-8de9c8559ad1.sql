
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.achievement_category AS ENUM ('play','build','social','community','tournament','misc');
CREATE TYPE public.achievement_tier AS ENUM ('bronze','silver','gold','platinum');
CREATE TYPE public.challenge_kind AS ENUM ('daily','weekly','seasonal');
CREATE TYPE public.challenge_goal_type AS ENUM (
  'rounds_played','holes_played','birdies','eagles','aces','new_courses',
  'posts_created','comments_made','friends_added','event_attended','event_hosted','courses_built'
);
CREATE TYPE public.goal_metric AS ENUM ('rounds','birdies','rating','courses_played','friends','xp');
CREATE TYPE public.community_event_kind AS ENUM ('cleanup','charity','group_round','meetup','clinic');
CREATE TYPE public.event_rsvp_status AS ENUM ('going','maybe','declined');

-- =========================================================================
-- USER PROGRESS
-- =========================================================================
CREATE TABLE public.user_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 0,
  coins integer NOT NULL DEFAULT 0,
  streak_days integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  title text NOT NULL DEFAULT 'Rookie',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT SELECT ON public.user_progress TO anon;
GRANT ALL ON public.user_progress TO service_role;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress readable by all" ON public.user_progress FOR SELECT USING (true);
CREATE POLICY "progress self write" ON public.user_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "progress self insert" ON public.user_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_user_progress_updated BEFORE UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- XP EVENTS
-- =========================================================================
CREATE TABLE public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  xp integer NOT NULL,
  ref_type text,
  ref_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX xp_events_unique_action ON public.xp_events(user_id, action_key, ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX xp_events_user_created ON public.xp_events(user_id, created_at DESC);
GRANT SELECT ON public.xp_events TO authenticated;
GRANT ALL ON public.xp_events TO service_role;
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp events self read" ON public.xp_events FOR SELECT USING (auth.uid() = user_id);

-- =========================================================================
-- ACHIEVEMENTS
-- =========================================================================
CREATE TABLE public.achievements (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'Trophy',
  category public.achievement_category NOT NULL,
  tier public.achievement_tier NOT NULL DEFAULT 'bronze',
  xp_reward integer NOT NULL DEFAULT 50,
  coin_reward integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements public read" ON public.achievements FOR SELECT USING (true);

CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key text NOT NULL REFERENCES public.achievements(key) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, achievement_key)
);
GRANT SELECT ON public.user_achievements TO authenticated, anon;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_achievements public read" ON public.user_achievements FOR SELECT USING (true);

-- =========================================================================
-- CHALLENGES
-- =========================================================================
CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  kind public.challenge_kind NOT NULL,
  goal_type public.challenge_goal_type NOT NULL,
  goal_target integer NOT NULL,
  xp_reward integer NOT NULL DEFAULT 100,
  coin_reward integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.challenges TO authenticated, anon;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "challenges public read" ON public.challenges FOR SELECT USING (true);

CREATE TABLE public.user_challenge_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_id)
);
GRANT SELECT, INSERT, UPDATE ON public.user_challenge_progress TO authenticated;
GRANT ALL ON public.user_challenge_progress TO service_role;
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ucp self read" ON public.user_challenge_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ucp self write" ON public.user_challenge_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================================
-- USER GOALS
-- =========================================================================
CREATE TABLE public.user_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  metric public.goal_metric NOT NULL,
  target integer NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  deadline date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goals TO authenticated;
GRANT ALL ON public.user_goals TO service_role;
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals owner read" ON public.user_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals owner write" ON public.user_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_user_goals_updated BEFORE UPDATE ON public.user_goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- COMMUNITY EVENTS
-- =========================================================================
CREATE TABLE public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.community_event_kind NOT NULL,
  title text NOT NULL,
  description text,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  location text,
  latitude double precision,
  longitude double precision,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  capacity integer,
  cover_url text,
  cause text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_events TO authenticated;
GRANT SELECT ON public.community_events TO anon;
GRANT ALL ON public.community_events TO service_role;
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events public read" ON public.community_events FOR SELECT USING (true);
CREATE POLICY "events host insert" ON public.community_events FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "events host update" ON public.community_events FOR UPDATE USING (auth.uid() = host_id OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "events host delete" ON public.community_events FOR DELETE USING (auth.uid() = host_id OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_community_events_updated BEFORE UPDATE ON public.community_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX community_events_starts_at ON public.community_events(starts_at);

CREATE TABLE public.event_rsvps (
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.event_rsvp_status NOT NULL DEFAULT 'going',
  attended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rsvps TO authenticated;
GRANT ALL ON public.event_rsvps TO service_role;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rsvp public read" ON public.event_rsvps FOR SELECT USING (true);
CREATE POLICY "rsvp self write" ON public.event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rsvp self update"
  ON public.event_rsvps FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.community_events e WHERE e.id = event_id AND e.host_id = auth.uid())
    OR public.has_role(auth.uid(),'super_admin')
  );
CREATE POLICY "rsvp self delete" ON public.event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- =========================================================================
-- CORE FUNCTIONS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.calc_level(_xp integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 100))::int);
$$;

CREATE OR REPLACE FUNCTION public.level_title(_level integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _level >= 40 THEN 'Legend'
    WHEN _level >= 25 THEN 'Champion'
    WHEN _level >= 15 THEN 'Pro'
    WHEN _level >= 8 THEN 'Advanced'
    WHEN _level >= 3 THEN 'Amateur'
    ELSE 'Rookie'
  END;
$$;

CREATE OR REPLACE FUNCTION public.award_xp(
  _user uuid, _action text, _xp integer, _ref_type text DEFAULT NULL, _ref_id text DEFAULT NULL, _meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_xp integer;
  new_level integer;
BEGIN
  IF _user IS NULL OR _xp IS NULL OR _xp <= 0 THEN RETURN; END IF;
  BEGIN
    INSERT INTO public.xp_events(user_id, action_key, xp, ref_type, ref_id, meta)
    VALUES (_user, _action, _xp, _ref_type, _ref_id, coalesce(_meta,'{}'::jsonb));
  EXCEPTION WHEN unique_violation THEN
    RETURN; -- already awarded for this ref
  END;
  INSERT INTO public.user_progress(user_id, xp) VALUES (_user, _xp)
  ON CONFLICT (user_id) DO UPDATE SET xp = public.user_progress.xp + EXCLUDED.xp;
  SELECT xp INTO new_xp FROM public.user_progress WHERE user_id = _user;
  new_level := public.calc_level(new_xp);
  UPDATE public.user_progress
     SET level = new_level, title = public.level_title(new_level)
   WHERE user_id = _user;
END; $$;

CREATE OR REPLACE FUNCTION public.award_achievement(_user uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reward integer;
  coins_reward integer;
  inserted boolean := false;
BEGIN
  IF _user IS NULL OR _key IS NULL THEN RETURN false; END IF;
  SELECT xp_reward, coin_reward INTO reward, coins_reward FROM public.achievements WHERE key = _key;
  IF reward IS NULL THEN RETURN false; END IF;
  INSERT INTO public.user_achievements(user_id, achievement_key)
  VALUES (_user, _key)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted THEN
    PERFORM public.award_xp(_user, 'achievement:'||_key, reward, 'achievement', _key);
    IF coins_reward > 0 THEN
      UPDATE public.user_progress SET coins = coins + coins_reward WHERE user_id = _user;
    END IF;
  END IF;
  RETURN inserted;
END; $$;

CREATE OR REPLACE FUNCTION public.bump_challenge_progress(_user uuid, _goal public.challenge_goal_type, _amount integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD;
BEGIN
  IF _user IS NULL OR _amount <= 0 THEN RETURN; END IF;
  FOR c IN
    SELECT * FROM public.challenges
    WHERE active = true AND goal_type = _goal
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at >= now())
  LOOP
    INSERT INTO public.user_challenge_progress(user_id, challenge_id, progress, updated_at)
    VALUES (_user, c.id, _amount, now())
    ON CONFLICT (user_id, challenge_id) DO UPDATE
      SET progress = public.user_challenge_progress.progress + EXCLUDED.progress,
          updated_at = now();
    UPDATE public.user_challenge_progress
       SET completed_at = now()
     WHERE user_id = _user AND challenge_id = c.id
       AND completed_at IS NULL AND progress >= c.goal_target;
    IF FOUND THEN
      PERFORM public.award_xp(_user, 'challenge:'||c.key, c.xp_reward, 'challenge', c.id::text);
      IF c.coin_reward > 0 THEN
        UPDATE public.user_progress SET coins = coins + c.coin_reward WHERE user_id = _user;
      END IF;
    END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.update_streak(_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  last_date date;
  cur_streak integer;
  today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.user_progress(user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  SELECT last_active_date, streak_days INTO last_date, cur_streak FROM public.user_progress WHERE user_id = _user;
  IF last_date = today THEN
    RETURN;
  ELSIF last_date = today - INTERVAL '1 day' THEN
    cur_streak := coalesce(cur_streak,0) + 1;
  ELSE
    cur_streak := 1;
  END IF;
  UPDATE public.user_progress
     SET streak_days = cur_streak,
         longest_streak = GREATEST(coalesce(longest_streak,0), cur_streak),
         last_active_date = today
   WHERE user_id = _user;
  IF cur_streak <= 7 THEN
    PERFORM public.award_xp(_user, 'daily_streak', 25 * cur_streak, 'streak', today::text);
  ELSE
    PERFORM public.award_xp(_user, 'daily_streak', 175, 'streak', today::text);
  END IF;
END; $$;

-- =========================================================================
-- TRIGGERS: ROUNDS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.on_round_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ct integer;
  new_course boolean := false;
BEGIN
  PERFORM public.award_xp(NEW.created_by, 'round_played', 50, 'round', NEW.id::text);
  PERFORM public.bump_challenge_progress(NEW.created_by, 'rounds_played', 1);
  PERFORM public.update_streak(NEW.created_by);

  SELECT COUNT(*) INTO ct FROM public.rounds WHERE created_by = NEW.created_by;
  IF ct = 1 THEN PERFORM public.award_achievement(NEW.created_by, 'first_round'); END IF;
  IF ct >= 10 THEN PERFORM public.award_achievement(NEW.created_by, 'rounds_10'); END IF;
  IF ct >= 100 THEN PERFORM public.award_achievement(NEW.created_by, 'rounds_100'); END IF;

  -- new course check
  IF NEW.course_id IS NOT NULL THEN
    SELECT NOT EXISTS(
      SELECT 1 FROM public.rounds
      WHERE created_by = NEW.created_by AND course_id = NEW.course_id AND id <> NEW.id
    ) INTO new_course;
    IF new_course THEN
      PERFORM public.award_xp(NEW.created_by, 'new_course', 100, 'course', NEW.course_id::text);
      PERFORM public.bump_challenge_progress(NEW.created_by, 'new_courses', 1);
      SELECT COUNT(DISTINCT course_id) INTO ct FROM public.rounds WHERE created_by = NEW.created_by AND course_id IS NOT NULL;
      IF ct >= 5 THEN PERFORM public.award_achievement(NEW.created_by, 'courses_5'); END IF;
      IF ct >= 25 THEN PERFORM public.award_achievement(NEW.created_by, 'courses_25'); END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_round_created AFTER INSERT ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.on_round_created();

-- Scoring milestones per stroke
CREATE OR REPLACE FUNCTION public.on_round_score_saved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hole_par integer;
  diff integer;
  round_owner uuid;
BEGIN
  IF NEW.strokes IS NULL OR NEW.strokes <= 0 THEN RETURN NEW; END IF;
  SELECT h.par INTO hole_par FROM public.holes h WHERE h.id = NEW.hole_id;
  SELECT r.created_by INTO round_owner FROM public.rounds r WHERE r.id = NEW.round_id;
  IF round_owner IS NULL OR hole_par IS NULL THEN RETURN NEW; END IF;
  diff := NEW.strokes - hole_par;
  PERFORM public.bump_challenge_progress(round_owner, 'holes_played', 1);
  IF NEW.strokes = 1 THEN
    PERFORM public.award_xp(round_owner, 'ace', 100, 'score', NEW.id::text);
    PERFORM public.award_achievement(round_owner, 'first_ace');
    PERFORM public.bump_challenge_progress(round_owner, 'aces', 1);
  ELSIF diff <= -2 THEN
    PERFORM public.award_xp(round_owner, 'eagle', 30, 'score', NEW.id::text);
    PERFORM public.award_achievement(round_owner, 'first_eagle');
    PERFORM public.bump_challenge_progress(round_owner, 'eagles', 1);
  ELSIF diff = -1 THEN
    PERFORM public.award_xp(round_owner, 'birdie', 10, 'score', NEW.id::text);
    PERFORM public.award_achievement(round_owner, 'first_birdie');
    PERFORM public.bump_challenge_progress(round_owner, 'birdies', 1);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_round_score AFTER INSERT ON public.round_scores FOR EACH ROW EXECUTE FUNCTION public.on_round_score_saved();

-- =========================================================================
-- TRIGGERS: POSTS, FRIENDSHIPS, COMMENTS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.on_post_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ct integer;
BEGIN
  PERFORM public.award_xp(NEW.user_id, 'post_created', 15, 'post', NEW.id::text);
  PERFORM public.bump_challenge_progress(NEW.user_id, 'posts_created', 1);
  SELECT COUNT(*) INTO ct FROM public.posts WHERE user_id = NEW.user_id;
  IF ct = 1 THEN PERFORM public.award_achievement(NEW.user_id, 'ice_breaker'); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_post_created AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.on_post_created();

CREATE OR REPLACE FUNCTION public.on_comment_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ct integer;
BEGIN
  PERFORM public.award_xp(NEW.user_id, 'comment_made', 2, 'comment', NEW.id::text);
  PERFORM public.bump_challenge_progress(NEW.user_id, 'comments_made', 1);
  SELECT COUNT(*) INTO ct FROM public.comments WHERE user_id = NEW.user_id;
  IF ct >= 10 THEN PERFORM public.award_achievement(NEW.user_id, 'rally'); END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_comment_created AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.on_comment_created();

CREATE OR REPLACE FUNCTION public.on_friendship_accepted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ct1 integer; ct2 integer;
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    PERFORM public.award_xp(NEW.requester_id, 'friend_added', 10, 'friendship', NEW.id::text||':a');
    PERFORM public.award_xp(NEW.addressee_id, 'friend_added', 10, 'friendship', NEW.id::text||':b');
    PERFORM public.bump_challenge_progress(NEW.requester_id, 'friends_added', 1);
    PERFORM public.bump_challenge_progress(NEW.addressee_id, 'friends_added', 1);

    SELECT COUNT(*) INTO ct1 FROM public.friendships
     WHERE status = 'accepted' AND (requester_id = NEW.requester_id OR addressee_id = NEW.requester_id);
    IF ct1 >= 10 THEN PERFORM public.award_achievement(NEW.requester_id, 'squad'); END IF;
    IF ct1 >= 50 THEN PERFORM public.award_achievement(NEW.requester_id, 'networker'); END IF;

    SELECT COUNT(*) INTO ct2 FROM public.friendships
     WHERE status = 'accepted' AND (requester_id = NEW.addressee_id OR addressee_id = NEW.addressee_id);
    IF ct2 >= 10 THEN PERFORM public.award_achievement(NEW.addressee_id, 'squad'); END IF;
    IF ct2 >= 50 THEN PERFORM public.award_achievement(NEW.addressee_id, 'networker'); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_friendship_ins AFTER INSERT ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.on_friendship_accepted();
CREATE TRIGGER trg_on_friendship_upd AFTER UPDATE ON public.friendships FOR EACH ROW EXECUTE FUNCTION public.on_friendship_accepted();

-- =========================================================================
-- TRIGGERS: COURSES (approved), TOURNAMENTS, LEAGUES
-- =========================================================================
CREATE OR REPLACE FUNCTION public.on_course_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ct integer;
BEGIN
  IF NEW.moderation_status = 'approved' AND (OLD.moderation_status IS DISTINCT FROM 'approved') AND NEW.created_by IS NOT NULL THEN
    PERFORM public.award_xp(NEW.created_by, 'course_approved', 500, 'course', NEW.id::text);
    PERFORM public.bump_challenge_progress(NEW.created_by, 'courses_built', 1);
    SELECT COUNT(*) INTO ct FROM public.courses WHERE created_by = NEW.created_by AND moderation_status = 'approved';
    IF ct = 1 THEN PERFORM public.award_achievement(NEW.created_by, 'course_architect'); END IF;
    IF ct >= 5 THEN PERFORM public.award_achievement(NEW.created_by, 'course_empire'); END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_course_approved AFTER UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.on_course_approved();

CREATE OR REPLACE FUNCTION public.on_tournament_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    PERFORM public.award_xp(NEW.created_by, 'tournament_hosted', 750, 'tournament', NEW.id::text);
    PERFORM public.award_achievement(NEW.created_by, 'td_rookie');
    PERFORM public.bump_challenge_progress(NEW.created_by, 'event_hosted', 1);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_tournament_created AFTER INSERT ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.on_tournament_created();

CREATE OR REPLACE FUNCTION public.on_league_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    PERFORM public.award_xp(NEW.created_by, 'league_started', 300, 'league', NEW.id::text);
    PERFORM public.award_achievement(NEW.created_by, 'league_commish');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_league_created AFTER INSERT ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.on_league_created();

-- =========================================================================
-- TRIGGERS: COMMUNITY EVENTS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.on_community_event_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.award_xp(NEW.host_id, 'event_hosted:'||NEW.kind::text, 200, 'event', NEW.id::text);
  PERFORM public.bump_challenge_progress(NEW.host_id, 'event_hosted', 1);
  IF NEW.kind = 'cleanup' THEN PERFORM public.award_achievement(NEW.host_id, 'green_warrior');
  ELSIF NEW.kind = 'charity' THEN PERFORM public.award_achievement(NEW.host_id, 'ambassador');
  ELSIF NEW.kind = 'group_round' THEN PERFORM public.award_achievement(NEW.host_id, 'group_chief');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_community_event_created AFTER INSERT ON public.community_events FOR EACH ROW EXECUTE FUNCTION public.on_community_event_created();

CREATE OR REPLACE FUNCTION public.on_rsvp_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev RECORD;
BEGIN
  IF NEW.attended = true AND (OLD IS NULL OR OLD.attended = false) THEN
    SELECT * INTO ev FROM public.community_events WHERE id = NEW.event_id;
    IF ev.id IS NOT NULL THEN
      PERFORM public.award_xp(NEW.user_id, 'event_attended:'||ev.kind::text, 200, 'event', NEW.event_id::text);
      PERFORM public.bump_challenge_progress(NEW.user_id, 'event_attended', 1);
      IF ev.kind = 'cleanup' THEN PERFORM public.award_achievement(NEW.user_id, 'trash_panda');
      ELSIF ev.kind = 'charity' THEN PERFORM public.award_achievement(NEW.user_id, 'good_neighbor');
      ELSIF ev.kind = 'group_round' THEN PERFORM public.award_achievement(NEW.user_id, 'squad_up');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_on_rsvp_ins AFTER INSERT ON public.event_rsvps FOR EACH ROW EXECUTE FUNCTION public.on_rsvp_change();
CREATE TRIGGER trg_on_rsvp_upd AFTER UPDATE ON public.event_rsvps FOR EACH ROW EXECUTE FUNCTION public.on_rsvp_change();

-- =========================================================================
-- SEEDS: ACHIEVEMENTS
-- =========================================================================
INSERT INTO public.achievements(key, name, description, icon, category, tier, xp_reward, sort_order) VALUES
-- Play
('first_round','Rookie Card','Post your first round','Disc','play','bronze',50,10),
('rounds_10','Regular','Post 10 rounds','Disc','play','silver',150,20),
('rounds_100','Century Club','Post 100 rounds','Disc','play','gold',500,30),
('first_birdie','Birdie!','Score your first birdie','Bird','play','bronze',25,40),
('first_eagle','Eagle Eye','Score your first eagle','Eagle','play','silver',150,50),
('first_ace','ACE!','Score your first hole-in-one','Zap','play','gold',500,60),
('courses_5','Wanderer','Play 5 different courses','MapPin','play','bronze',100,70),
('courses_25','Explorer','Play 25 different courses','Map','play','gold',400,80),
-- Build
('course_architect','Course Architect','Get your first course approved','Hammer','build','silver',300,100),
('course_empire','Course Empire','Get 5 courses approved','Building','build','gold',800,110),
('cartographer','Cartographer','Upload a course flythrough','Video','build','silver',200,120),
-- Social
('ice_breaker','Ice Breaker','Publish your first post','MessageSquare','social','bronze',25,200),
('rally','Rally','Post 10 comments','MessagesSquare','social','bronze',50,210),
('squad','Squad','Make 10 friends','Users','social','silver',150,220),
('networker','Networker','Make 50 friends','UsersRound','social','gold',400,230),
-- Community
('trash_panda','Trash Panda','Attend a course cleanup','Recycle','community','silver',200,300),
('green_warrior','Green Warrior','Host a course cleanup','Leaf','community','gold',400,310),
('ambassador','Ambassador','Host a charity event','HeartHandshake','community','gold',500,320),
('good_neighbor','Good Neighbor','Attend a charity event','Heart','community','silver',200,325),
('group_chief','Group Chief','Host a group round','Users','community','bronze',100,330),
('squad_up','Squad Up','Attend a group round','Users','community','bronze',75,335),
-- Tournament / League
('td_rookie','TD Rookie','Host your first tournament','Trophy','tournament','silver',300,400),
('league_commish','Commissioner','Start your first league','Award','tournament','silver',200,410)
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- SEEDS: CHALLENGES
-- =========================================================================
INSERT INTO public.challenges(key,title,description,kind,goal_type,goal_target,xp_reward,coin_reward,ends_at) VALUES
('daily_9','Play 9','Play at least 9 holes today','daily','holes_played',9,50,5, now()+interval '1 day'),
('daily_post','Share the day','Publish a post today','daily','posts_created',1,25,2, now()+interval '1 day'),
('daily_comment','Chat it up','Comment on 3 posts today','daily','comments_made',3,25,2, now()+interval '1 day'),
('weekly_rounds','Weekly Warrior','Post 3 rounds this week','weekly','rounds_played',3,150,10, now()+interval '7 days'),
('weekly_birdies','Birdie Blitz','Card 10 birdies this week','weekly','birdies',10,200,15, now()+interval '7 days'),
('weekly_new_course','Explore','Play a new course this week','weekly','new_courses',1,150,10, now()+interval '7 days'),
('weekly_friends','Grow the crew','Add a new friend this week','weekly','friends_added',1,75,5, now()+interval '7 days'),
('weekly_community','Give Back','Attend or host a community event','weekly','event_attended',1,250,20, now()+interval '7 days'),
('season_50','Season Grinder','Play 50 rounds this season','seasonal','rounds_played',50,1000,100, now()+interval '90 days'),
('season_ace','Ace Chaser','Land an ace this season','seasonal','aces',1,1500,150, now()+interval '90 days'),
('season_community','Community Champion','Join 3 community events','seasonal','event_attended',3,750,75, now()+interval '90 days')
ON CONFLICT (key) DO NOTHING;
