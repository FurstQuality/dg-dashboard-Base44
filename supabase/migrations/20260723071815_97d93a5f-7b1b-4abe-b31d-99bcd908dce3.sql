-- 1. Extend per-hole scores with GPS-derived shot stats
ALTER TABLE public.round_scores
  ADD COLUMN IF NOT EXISTS throw_in_ft numeric,
  ADD COLUMN IF NOT EXISTS longest_throw_ft numeric;

-- 2. Trigger function: award throw-in / big-drive achievements + XP
CREATE OR REPLACE FUNCTION public.on_round_score_shot_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  round_owner uuid;
  player_owner uuid;
  hole_par integer;
BEGIN
  -- Only run when GPS-derived stats are present
  IF (NEW.throw_in_ft IS NULL AND NEW.longest_throw_ft IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Attribute stats to the actual player (user_id on round_players), fall back to round creator
  SELECT rp.user_id INTO player_owner
    FROM public.round_players rp WHERE rp.id = NEW.round_player_id;
  IF player_owner IS NULL THEN
    SELECT r.created_by INTO player_owner FROM public.rounds r WHERE r.id = NEW.round_id;
  END IF;
  IF player_owner IS NULL THEN RETURN NEW; END IF;

  SELECT h.par INTO hole_par
    FROM public.holes h
    JOIN public.rounds r ON r.id = NEW.round_id
   WHERE h.layout_id = r.layout_id AND h.number = NEW.hole_number
   LIMIT 1;

  -- Throw-in tiers (make from outside circle 1 = >33 ft)
  IF NEW.throw_in_ft IS NOT NULL AND NEW.throw_in_ft >= 34 THEN
    PERFORM public.award_xp(
      player_owner, 'throw_in', LEAST(500, GREATEST(20, ROUND(NEW.throw_in_ft)::int)),
      'score', NEW.id::text || ':throwin'
    );
    IF NEW.throw_in_ft >= 200 THEN PERFORM public.award_achievement(player_owner, 'throw_in_200');
    ELSIF NEW.throw_in_ft >= 150 THEN PERFORM public.award_achievement(player_owner, 'throw_in_150');
    ELSIF NEW.throw_in_ft >= 100 THEN PERFORM public.award_achievement(player_owner, 'throw_in_100');
    ELSIF NEW.throw_in_ft >= 50 THEN PERFORM public.award_achievement(player_owner, 'throw_in_50');
    ELSE PERFORM public.award_achievement(player_owner, 'throw_in_34');
    END IF;
  END IF;

  -- Big-drive tiers on longest throw
  IF NEW.longest_throw_ft IS NOT NULL THEN
    IF NEW.longest_throw_ft >= 500 THEN PERFORM public.award_achievement(player_owner, 'big_arm_500'); END IF;
    IF NEW.longest_throw_ft >= 400 THEN PERFORM public.award_achievement(player_owner, 'big_arm_400'); END IF;
    IF NEW.longest_throw_ft >= 300 THEN PERFORM public.award_achievement(player_owner, 'big_arm_300'); END IF;
  END IF;

  -- Small assist: unused variable warning
  PERFORM 1 WHERE hole_par IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_round_score_shot_stats ON public.round_scores;
CREATE TRIGGER trg_on_round_score_shot_stats
AFTER INSERT OR UPDATE OF throw_in_ft, longest_throw_ft ON public.round_scores
FOR EACH ROW EXECUTE FUNCTION public.on_round_score_shot_stats();