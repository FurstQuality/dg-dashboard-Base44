-- 1. Avatars/covers: only the owner reads directly; everyone else uses signed links.
DROP POLICY IF EXISTS "Profile avatars and covers are public" ON storage.objects;
CREATE POLICY "Owners read their avatars and covers"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('avatars','covers') AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Tournament scores: only the TD or tournament staff can write.
DROP POLICY IF EXISTS "Player or TD writes scores" ON public.tournament_scores;
CREATE POLICY "TD or staff writes scores"
  ON public.tournament_scores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tournament_rounds tr JOIN public.tournaments t ON t.id = tr.tournament_id
     WHERE tr.id = tournament_scores.round_id
       AND (t.owner_id = auth.uid() OR public.is_tournament_staff(t.id, auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tournament_rounds tr JOIN public.tournaments t ON t.id = tr.tournament_id
     WHERE tr.id = tournament_scores.round_id
       AND (t.owner_id = auth.uid() OR public.is_tournament_staff(t.id, auth.uid()))));

-- 3. Round ratings: recompute every field from stored, cardmate-confirmed scores.
CREATE OR REPLACE FUNCTION public.verify_round_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; rp record;
  hole_ct int; par_sum int; n_scores int; total int;
  card_size int; scorers int; required int; unconfirmed int;
  scratch int; sv numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- trusted server jobs
  SELECT * INTO r FROM rounds WHERE id = NEW.round_id;
  IF r.id IS NULL OR r.is_rated = false OR r.rating_mode = 'casual' THEN
    RAISE EXCEPTION 'This round is not rated';
  END IF;
  SELECT * INTO rp FROM round_players WHERE id = NEW.round_player_id AND round_id = NEW.round_id;
  IF rp.id IS NULL THEN RAISE EXCEPTION 'Player is not on this card'; END IF;

  SELECT count(*), coalesce(sum(par),0) INTO hole_ct, par_sum FROM holes WHERE layout_id = r.layout_id;
  SELECT count(*), coalesce(sum(strokes),0) INTO n_scores, total
    FROM round_scores WHERE round_player_id = rp.id AND round_id = r.id;
  IF hole_ct = 0 OR n_scores <> hole_ct THEN RAISE EXCEPTION 'Every hole must be scored'; END IF;

  SELECT count(*) INTO card_size FROM round_players WHERE round_id = r.id;
  IF card_size < 2 THEN RAISE EXCEPTION 'Solo rounds are not rated'; END IF;
  SELECT count(*) INTO scorers FROM (
    SELECT s.round_player_id FROM round_scores s WHERE s.round_id = r.id
    GROUP BY s.round_player_id HAVING count(*) = hole_ct) x;
  required := CASE least(card_size,10) WHEN 2 THEN 2 WHEN 3 THEN 2 WHEN 4 THEN 3 WHEN 5 THEN 3
    WHEN 6 THEN 4 WHEN 7 THEN 5 WHEN 8 THEN 5 WHEN 9 THEN 6 ELSE 6 END;
  IF scorers < required THEN RAISE EXCEPTION 'Not enough scorers on the card'; END IF;

  SELECT count(*) INTO unconfirmed FROM round_scores s
   WHERE s.round_player_id = rp.id AND s.round_id = r.id
     AND NOT EXISTS (SELECT 1 FROM round_score_confirmations c
       WHERE c.round_player_id = s.round_player_id AND c.hole_number = s.hole_number
         AND c.strokes = s.strokes
         AND c.confirmed_by IS DISTINCT FROM rp.user_id);
  IF unconfirmed > 0 THEN RAISE EXCEPTION 'Scores need cardmate confirmation'; END IF;

  SELECT coalesce(scratch_rating,950), coalesce(stroke_value,10) INTO scratch, sv
    FROM course_layouts WHERE id = r.layout_id;
  scratch := coalesce(scratch,950); sv := coalesce(sv,10);

  NEW.user_id := rp.user_id;
  NEW.guest_name := CASE WHEN rp.user_id IS NULL THEN rp.guest_name END;
  NEW.course_id := r.course_id;
  NEW.layout_id := r.layout_id;
  NEW.holes_played := n_scores;
  NEW.layout_hole_count := hole_ct;
  NEW.total_strokes := total;
  NEW.par_total := par_sum;
  NEW.score_to_par := total - par_sum;
  NEW.scratch_rating := scratch;
  NEW.stroke_value := sv;
  NEW.round_rating := round(scratch - (total - par_sum) * sv)::int;
  NEW.pdga_rating_at_time := (SELECT pdga_rating FROM profiles WHERE id = rp.user_id);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.verify_round_rating() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a_verify_round_rating ON public.round_ratings;
CREATE TRIGGER a_verify_round_rating BEFORE INSERT OR UPDATE ON public.round_ratings
  FOR EACH ROW EXECUTE FUNCTION public.verify_round_rating();

-- 4. Progress: awarded only for verified rated rounds, to the actual player.
CREATE OR REPLACE FUNCTION public.on_round_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.update_streak(NEW.created_by);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_on_round_score ON public.round_scores;

CREATE OR REPLACE FUNCTION public.on_verified_round_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ct int; s record; diff int;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  PERFORM award_xp(NEW.user_id, 'round_played', 50, 'round', NEW.round_id::text, '{}'::jsonb);
  PERFORM bump_challenge_progress(NEW.user_id, 'rounds_played', 1);
  SELECT count(*) INTO ct FROM round_ratings WHERE user_id = NEW.user_id;
  IF ct >= 1 THEN PERFORM award_achievement(NEW.user_id, 'first_round'); END IF;
  IF ct >= 10 THEN PERFORM award_achievement(NEW.user_id, 'rounds_10'); END IF;
  IF ct >= 100 THEN PERFORM award_achievement(NEW.user_id, 'rounds_100'); END IF;
  IF NEW.course_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM round_ratings
      WHERE user_id = NEW.user_id AND course_id = NEW.course_id AND id <> NEW.id) THEN
    PERFORM award_xp(NEW.user_id, 'new_course', 100, 'course', NEW.course_id::text, '{}'::jsonb);
    PERFORM bump_challenge_progress(NEW.user_id, 'new_courses', 1);
    SELECT count(DISTINCT course_id) INTO ct FROM round_ratings WHERE user_id = NEW.user_id;
    IF ct >= 5 THEN PERFORM award_achievement(NEW.user_id, 'courses_5'); END IF;
    IF ct >= 25 THEN PERFORM award_achievement(NEW.user_id, 'courses_25'); END IF;
  END IF;
  FOR s IN SELECT sc.id, sc.strokes, h.par FROM round_scores sc
      JOIN holes h ON h.layout_id = NEW.layout_id AND h.number = sc.hole_number
      WHERE sc.round_player_id = NEW.round_player_id LOOP
    PERFORM bump_challenge_progress(NEW.user_id, 'holes_played', 1);
    diff := s.strokes - s.par;
    IF s.strokes = 1 THEN
      PERFORM award_xp(NEW.user_id, 'ace', 100, 'score', s.id::text, '{}'::jsonb);
      PERFORM award_achievement(NEW.user_id, 'first_ace');
      PERFORM bump_challenge_progress(NEW.user_id, 'aces', 1);
    ELSIF diff <= -2 THEN
      PERFORM award_xp(NEW.user_id, 'eagle', 30, 'score', s.id::text, '{}'::jsonb);
      PERFORM award_achievement(NEW.user_id, 'first_eagle');
      PERFORM bump_challenge_progress(NEW.user_id, 'eagles', 1);
    ELSIF diff = -1 THEN
      PERFORM award_xp(NEW.user_id, 'birdie', 10, 'score', s.id::text, '{}'::jsonb);
      PERFORM award_achievement(NEW.user_id, 'first_birdie');
      PERFORM bump_challenge_progress(NEW.user_id, 'birdies', 1);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.on_verified_round_rating() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_on_verified_round_rating ON public.round_ratings;
CREATE TRIGGER trg_on_verified_round_rating AFTER INSERT ON public.round_ratings
  FOR EACH ROW EXECUTE FUNCTION public.on_verified_round_rating();