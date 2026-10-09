CREATE OR REPLACE FUNCTION public.on_round_score_variance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
  target_name text;
  app_players int;
  full_confirmers int;
  card_size int;
BEGIN
  IF NEW.strokes IS NOT DISTINCT FROM OLD.strokes THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO card_size FROM public.round_players WHERE round_id = NEW.round_id;
  SELECT count(*) INTO app_players
    FROM public.round_players WHERE round_id = NEW.round_id AND user_id IS NOT NULL;

  SELECT count(*) INTO full_confirmers FROM (
    SELECT c.confirmed_by
    FROM public.round_score_confirmations c
    WHERE c.round_id = NEW.round_id AND c.hole_number = NEW.hole_number
    GROUP BY c.confirmed_by
    HAVING count(DISTINCT c.round_player_id) >= card_size
  ) t;

  IF app_players = 0 OR card_size = 0 OR full_confirmers < app_players THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(pr.display_name, pr.username) INTO actor_name
    FROM public.profiles pr WHERE pr.id = actor;

  SELECT coalesce(pr.display_name, pr.username, rp.guest_name) INTO target_name
    FROM public.round_players rp
    LEFT JOIN public.profiles pr ON pr.id = rp.user_id
    WHERE rp.id = NEW.round_player_id;

  DELETE FROM public.round_score_confirmations
   WHERE round_id = NEW.round_id AND hole_number = NEW.hole_number;

  INSERT INTO public.notifications (user_id, actor_id, type, data)
  SELECT rp.user_id, actor, 'score_change'::public.notification_type,
    jsonb_build_object(
      'title', 'Score variance on hole ' || NEW.hole_number,
      'body', coalesce(actor_name, 'A cardmate') || ' marked ' || coalesce(target_name, 'a player')
              || ' as a ' || NEW.strokes || ' on hole ' || NEW.hole_number
              || ' (was ' || OLD.strokes || '). Everyone needs to confirm the card again.',
      'link', '/play/' || NEW.round_id,
      'round_id', NEW.round_id,
      'hole_number', NEW.hole_number,
      'strokes', NEW.strokes,
      'previous_strokes', OLD.strokes
    )
  FROM public.round_players rp
  WHERE rp.round_id = NEW.round_id
    AND rp.user_id IS NOT NULL
    AND rp.user_id IS DISTINCT FROM actor;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_round_score_variance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_round_score_variance ON public.round_scores;
CREATE TRIGGER trg_round_score_variance
AFTER UPDATE OF strokes ON public.round_scores
FOR EACH ROW EXECUTE FUNCTION public.on_round_score_variance();