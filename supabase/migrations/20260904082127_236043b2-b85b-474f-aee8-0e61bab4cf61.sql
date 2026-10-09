CREATE OR REPLACE FUNCTION public.on_tournament_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    PERFORM public.award_xp(NEW.owner_id, 'tournament_hosted', 750, 'tournament', NEW.id::text);
    PERFORM public.award_achievement(NEW.owner_id, 'td_rookie');
    PERFORM public.bump_challenge_progress(NEW.owner_id, 'event_hosted', 1);
  END IF;
  RETURN NEW;
END; $function$;