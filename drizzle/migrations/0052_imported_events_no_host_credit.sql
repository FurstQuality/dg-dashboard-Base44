ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS imported_source text;
COMMENT ON COLUMN public.tournaments.imported_source IS 'Set when the event was copied from PDGA / Disc Golf Scene for series tracking. Imported events never award hosting XP, achievements or Tier credit to the app owner.';

CREATE OR REPLACE FUNCTION public.on_tournament_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND NEW.imported_source IS NULL THEN
    PERFORM public.award_xp(NEW.owner_id, 'tournament_hosted', 750, 'tournament', NEW.id::text);
    PERFORM public.award_achievement(NEW.owner_id, 'td_rookie');
    PERFORM public.bump_challenge_progress(NEW.owner_id, 'event_hosted', 1);
  END IF;
  RETURN NEW;
END; $$;