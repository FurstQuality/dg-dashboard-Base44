CREATE OR REPLACE FUNCTION public.on_league_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    PERFORM public.award_xp(NEW.owner_id, 'league_started', 300, 'league', NEW.id::text);
    PERFORM public.award_achievement(NEW.owner_id, 'league_commish');
  END IF;
  RETURN NEW;
END; $function$;