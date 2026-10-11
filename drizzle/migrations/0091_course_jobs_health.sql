CREATE OR REPLACE FUNCTION public.course_jobs_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN NULL ELSE
  jsonb_build_object(
    'catalog_last_run', (SELECT max(started_at) FROM public.ingest_runs),
    'catalog_runs_24h', (SELECT count(*) FROM public.ingest_runs WHERE started_at > now() - interval '24 hours'),
    'catalog_read_24h', (SELECT coalesce(sum(succeeded), 0) FROM public.ingest_runs WHERE started_at > now() - interval '24 hours'),
    'catalog_failed_24h', (SELECT coalesce(sum(failed), 0) FROM public.ingest_runs WHERE started_at > now() - interval '24 hours'),
    'catalog_waiting', (SELECT count(*) FROM public.udisc_catalog WHERE status IN ('new', 'queued')),
    'listings_last_read', (SELECT max(last_fetched_at) FROM public.course_sources WHERE source IN ('udisc', 'disc_golf_scene')),
    'listings_read_24h', (SELECT count(*) FROM public.course_sources WHERE last_fetched_at > now() - interval '24 hours'),
    'listings_never_read', (SELECT count(*) FROM public.course_sources WHERE source IN ('udisc', 'disc_golf_scene') AND last_fetched_at IS NULL AND canonical_url IS NOT NULL),
    'listing_errors', (SELECT coalesce(jsonb_agg(jsonb_build_object('reason', last_error, 'n', n) ORDER BY n DESC), '[]'::jsonb)
                         FROM (SELECT last_error, count(*) n FROM public.course_sources WHERE last_error IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10) e),
    'scene_events_checked', (SELECT count(*) FROM public.source_snapshots WHERE source = 'disc_golf_scene' AND entity_type = 'event_course_link'),
    'scene_links', (SELECT count(*) FROM public.course_sources WHERE source = 'disc_golf_scene'),
    'town_centre_pins_left', (SELECT count(*) FROM public.courses WHERE location_quality = 'city_approximate' AND coalesce(is_ghost, false) = false AND merged_into_course_id IS NULL),
    'par_from_listings', (SELECT count(*) FROM public.holes WHERE par_source IS NOT NULL),
    'draft_layouts', (SELECT count(*) FROM public.course_layouts WHERE status = 'draft')
  ) END;
$$;
REVOKE ALL ON FUNCTION public.course_jobs_health() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.course_jobs_health() TO authenticated;