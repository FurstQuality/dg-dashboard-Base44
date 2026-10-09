CREATE OR REPLACE FUNCTION public.on_round_score_saved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hole_par integer;
  diff integer;
  round_owner uuid;
BEGIN
  IF NEW.strokes IS NULL OR NEW.strokes <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT r.created_by, h.par
    INTO round_owner, hole_par
    FROM public.rounds r
    LEFT JOIN public.holes h
      ON h.layout_id = r.layout_id
     AND h.number = NEW.hole_number
   WHERE r.id = NEW.round_id
   LIMIT 1;

  IF round_owner IS NULL OR hole_par IS NULL THEN
    RETURN NEW;
  END IF;

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
END;
$$;