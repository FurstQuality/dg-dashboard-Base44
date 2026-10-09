CREATE OR REPLACE FUNCTION public.autopost_achievement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opt text;
  _name text;
  _desc text;
BEGIN
  SELECT p.privacy_prefs->>'auto_post_achievements' INTO _opt
  FROM public.profiles p WHERE p.id = NEW.user_id;
  IF _opt = 'false' THEN RETURN NEW; END IF;

  SELECT a.name, a.description INTO _name, _desc
  FROM public.achievements a WHERE a.key = NEW.achievement_key;

  INSERT INTO public.posts (author_id, type, body, media)
  VALUES (
    NEW.user_id,
    'text',
    'Unlocked a new badge: ' || COALESCE(_name, NEW.achievement_key)
      || CASE WHEN _desc IS NOT NULL THEN ' — ' || _desc ELSE '' END,
    '[]'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autopost_achievement ON public.user_achievements;
CREATE TRIGGER trg_autopost_achievement
AFTER INSERT ON public.user_achievements
FOR EACH ROW EXECUTE FUNCTION public.autopost_achievement();

CREATE OR REPLACE FUNCTION public.autopost_duel_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opt text;
  _winner text;
BEGIN
  IF NEW.winner_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.winner_id IS NOT DISTINCT FROM NEW.winner_id THEN RETURN NEW; END IF;

  SELECT p.privacy_prefs->>'auto_post_duels', p.display_name
    INTO _opt, _winner
  FROM public.profiles p WHERE p.id = NEW.winner_id;
  IF _opt = 'false' THEN RETURN NEW; END IF;

  INSERT INTO public.posts (author_id, type, body, media)
  VALUES (
    NEW.winner_id,
    'text',
    'Won the ' || NEW.title || ' challenge in the Arena — ' || NEW.wager_xp || ' XP on the line.',
    '[]'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autopost_duel_result ON public.game_duels;
CREATE TRIGGER trg_autopost_duel_result
AFTER UPDATE ON public.game_duels
FOR EACH ROW EXECUTE FUNCTION public.autopost_duel_result();

REVOKE ALL ON FUNCTION public.autopost_achievement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autopost_achievement() FROM anon;
REVOKE ALL ON FUNCTION public.autopost_achievement() FROM authenticated;
REVOKE ALL ON FUNCTION public.autopost_duel_result() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autopost_duel_result() FROM anon;
REVOKE ALL ON FUNCTION public.autopost_duel_result() FROM authenticated;