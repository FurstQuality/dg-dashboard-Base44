CREATE OR REPLACE FUNCTION public.on_post_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ct integer;
BEGIN
  PERFORM public.award_xp(NEW.author_id, 'post_created', 15, 'post', NEW.id::text);
  PERFORM public.bump_challenge_progress(NEW.author_id, 'posts_created', 1);
  SELECT COUNT(*) INTO ct FROM public.posts WHERE author_id = NEW.author_id;
  IF ct = 1 THEN PERFORM public.award_achievement(NEW.author_id, 'ice_breaker'); END IF;
  RETURN NEW;
END; $function$;