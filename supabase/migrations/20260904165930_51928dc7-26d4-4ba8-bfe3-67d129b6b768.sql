CREATE OR REPLACE FUNCTION public.autopost_achievement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _desc text;
  _tier text;
  _allowed boolean;
BEGIN
  SELECT coalesce((p.privacy_prefs->>'auto_post_achievements')::boolean, true)
    INTO _allowed
    FROM public.profiles p
   WHERE p.id = NEW.user_id;
  IF _allowed IS FALSE THEN
    RETURN NEW;
  END IF;

  SELECT a.name, a.description, a.tier::text
    INTO _name, _desc, _tier
    FROM public.achievements a
   WHERE a.key = NEW.achievement_key;
  IF _name IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.posts (author_id, type, body, media, visibility, score_data)
  VALUES (
    NEW.user_id,
    'text',
    'Unlocked a new badge: ' || _name || coalesce(' — ' || _desc, ''),
    '[]'::jsonb,
    'public',
    jsonb_build_object('auto', 'achievement', 'achievement_name', _name, 'tier', _tier)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.autopost_duel_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean;
BEGIN
  IF NEW.winner_id IS NULL OR NEW.winner_id IS NOT DISTINCT FROM OLD.winner_id THEN
    RETURN NEW;
  END IF;

  SELECT coalesce((p.privacy_prefs->>'auto_post_duels')::boolean, true)
    INTO _allowed
    FROM public.profiles p
   WHERE p.id = NEW.winner_id;
  IF _allowed IS FALSE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.posts (author_id, type, body, media, visibility, score_data)
  VALUES (
    NEW.winner_id,
    'text',
    'Won a head-to-head duel: ' || coalesce(NEW.title, 'Face Off') || '.',
    '[]'::jsonb,
    'public',
    jsonb_build_object('auto', 'duel', 'duel_id', NEW.id, 'game', NEW.title)
  );
  RETURN NEW;
END;
$$;