CREATE OR REPLACE FUNCTION public.merge_duplicate_courses(_keep_id uuid, _duplicate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keep public.courses;
  dupe public.courses;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can merge courses';
  END IF;
  IF _keep_id = _duplicate_id THEN
    RAISE EXCEPTION 'Pick two different courses to merge';
  END IF;

  SELECT * INTO keep FROM public.courses WHERE id = _keep_id;
  SELECT * INTO dupe FROM public.courses WHERE id = _duplicate_id;
  IF keep.id IS NULL OR dupe.id IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- Fill only gaps on the course we keep; never overwrite curated details.
  UPDATE public.courses SET
    description = COALESCE(description, dupe.description),
    city = COALESCE(city, dupe.city),
    state = COALESCE(state, dupe.state),
    country = COALESCE(country, dupe.country),
    postal_code = COALESCE(postal_code, dupe.postal_code),
    latitude = COALESCE(latitude, dupe.latitude),
    longitude = COALESCE(longitude, dupe.longitude),
    cover_url = COALESCE(cover_url, dupe.cover_url),
    difficulty = COALESCE(difficulty, dupe.difficulty),
    overview_snapshot_path = COALESCE(overview_snapshot_path, dupe.overview_snapshot_path),
    flythrough_url = COALESCE(flythrough_url, dupe.flythrough_url),
    flythrough_path = COALESCE(flythrough_path, dupe.flythrough_path),
    flythrough_poster_url = COALESCE(flythrough_poster_url, dupe.flythrough_poster_url),
    pdga_course_id = COALESCE(pdga_course_id, dupe.pdga_course_id),
    pdga_url = COALESCE(pdga_url, dupe.pdga_url),
    pdga_rating = COALESCE(pdga_rating, dupe.pdga_rating),
    pdga_rating_votes = COALESCE(pdga_rating_votes, dupe.pdga_rating_votes),
    designer = COALESCE(designer, dupe.designer),
    year_established = COALESCE(year_established, dupe.year_established),
    source = COALESCE(source, dupe.source),
    source_ref = COALESCE(source_ref, dupe.source_ref),
    enrichment_source = COALESCE(enrichment_source, dupe.enrichment_source),
    enriched_at = COALESCE(enriched_at, dupe.enriched_at),
    hole_count = CASE
      WHEN COALESCE(hole_count_verified, false) THEN hole_count
      WHEN COALESCE(dupe.hole_count_verified, false) THEN dupe.hole_count
      ELSE GREATEST(hole_count, dupe.hole_count)
    END,
    hole_count_verified = COALESCE(hole_count_verified, false) OR COALESCE(dupe.hole_count_verified, false),
    updated_at = now()
  WHERE id = _keep_id;

  -- Drop duplicate rows that would collide on per-course uniqueness.
  DELETE FROM public.course_sources d
   WHERE d.course_id = _duplicate_id
     AND EXISTS (SELECT 1 FROM public.course_sources k WHERE k.course_id = _keep_id AND k.source = d.source);
  DELETE FROM public.course_layout_profiles d
   WHERE d.course_id = _duplicate_id
     AND EXISTS (SELECT 1 FROM public.course_layout_profiles k WHERE k.course_id = _keep_id);

  -- Move everything attached to the duplicate onto the course we keep.
  UPDATE public.course_layouts SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_features SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_book_entries SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_layout_profiles SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_rating_profiles SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_reviews SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_sources SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_ingest_jobs SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.course_edit_requests SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.dgcr_courses SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.rounds SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.round_ratings SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.community_events SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.event_join_codes SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.leagues SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.league_events SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.tournaments SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.tournament_rounds SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.play_intents SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.lost_disc_reports SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.marketplace_listings SET course_id = _keep_id WHERE course_id = _duplicate_id;
  UPDATE public.osm_places SET imported_course_id = _keep_id WHERE imported_course_id = _duplicate_id;

  -- Keep the duplicate row for history, clearly marked as merged.
  UPDATE public.courses SET
    moderation_status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = 'Merged into ' || keep.name || ' (' || _keep_id::text || ')',
    updated_at = now()
  WHERE id = _duplicate_id;

  RETURN _keep_id;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_courses(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_courses(uuid, uuid) TO authenticated;