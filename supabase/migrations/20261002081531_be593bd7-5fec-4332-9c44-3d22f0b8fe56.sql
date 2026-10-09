CREATE OR REPLACE FUNCTION public.resolve_duel(_duel uuid, _winner uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _stake integer;
  _players integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_duel_participant(_duel, auth.uid()) THEN
    RAISE EXCEPTION 'Only players in this challenge can settle it.';
  END IF;
  IF NOT public.is_duel_participant(_duel, _winner) THEN
    RAISE EXCEPTION 'The winner must be a player in this challenge.';
  END IF;
  IF _winner = auth.uid() THEN
    RAISE EXCEPTION 'Your opponent confirms the winner — you can''t settle a duel in your own favor.';
  END IF;
  SELECT count(*) INTO _players FROM public.duel_participants WHERE duel_id = _duel;
  IF _players < 2 THEN
    RAISE EXCEPTION 'A duel needs at least two players before it can be settled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.duel_submissions s WHERE s.duel_id = _duel AND s.user_id = _winner AND s.score IS NOT NULL) THEN
    RAISE EXCEPTION 'The winner needs a submitted score first.';
  END IF;

  SELECT wager_xp INTO _stake FROM public.game_duels WHERE id = _duel;

  UPDATE public.game_duels
     SET winner_id = _winner, status = 'completed', completed_at = now()
   WHERE id = _duel AND status <> 'completed';

  IF FOUND THEN
    PERFORM public.award_xp(_winner, 'duel_win', LEAST(GREATEST(COALESCE(_stake, 25), 5), 100), 'duel', _duel::text, '{}'::jsonb);
  END IF;
END;
$function$;

DROP POLICY IF EXISTS "storage_public_read_media" ON storage.objects;

CREATE POLICY "Profile avatars and covers are public"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('avatars', 'covers'));

CREATE POLICY "Post media follows post visibility"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'posts' AND (
      (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text)
      OR EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.media @> jsonb_build_array(jsonb_build_object('path', objects.name))
          AND public.can_view_post(p.id)
      )
    )
  );

CREATE INDEX IF NOT EXISTS posts_media_gin_idx ON public.posts USING gin (media jsonb_path_ops);