CREATE OR REPLACE FUNCTION public.on_comment_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ct integer;
BEGIN
  PERFORM public.award_xp(NEW.author_id, 'comment_made', 2, 'comment', NEW.id::text);
  PERFORM public.bump_challenge_progress(NEW.author_id, 'comments_made', 1);
  SELECT COUNT(*) INTO ct FROM public.comments WHERE author_id = NEW.author_id;
  IF ct >= 10 THEN PERFORM public.award_achievement(NEW.author_id, 'rally'); END IF;
  RETURN NEW;
END; $function$;