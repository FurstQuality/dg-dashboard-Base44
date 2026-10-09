-- Read-only diagnostics for the course-builder release gates.
-- Run against an authorized staging copy before proposing a migration.
-- Old snapshots may lack new fields; do not backfill or rewrite played versions.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

-- Compare deployed functions with repository definitions. This does not call them.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'save_layout_slots', 'sync_layout_legacy_holes', 'copy_layout', 'publish_layout',
  'begin_layout_hole_renumber', 'build_event_round_snapshot',
  'attach_round_event_snapshot', 'can_edit_layout', 'can_steward_course',
  'freeze_layout_version', 'event_has_capability'
)
ORDER BY p.proname, arguments;

-- All referenced assets must belong to the layout's course.
SELECT count(*) AS slots_with_invalid_course_references
FROM public.layout_slots s
JOIN public.course_layouts l ON l.id = s.layout_id
LEFT JOIN public.course_holes h ON h.id = s.course_hole_id
LEFT JOIN public.course_tees t ON t.id = s.tee_id
LEFT JOIN public.course_baskets b ON b.id = s.basket_id
WHERE h.id IS NULL OR h.course_id IS DISTINCT FROM l.course_id
   OR (s.tee_id IS NOT NULL AND (t.id IS NULL OR t.course_id IS DISTINCT FROM l.course_id OR t.course_hole_id IS DISTINCT FROM s.course_hole_id))
   OR (s.basket_id IS NOT NULL AND (b.id IS NULL OR b.course_id IS DISTINCT FROM l.course_id OR b.course_hole_id IS DISTINCT FROM s.course_hole_id));

SELECT count(*) AS included_slots_missing_par_or_assets
FROM public.layout_slots
WHERE included AND (tee_id IS NULL OR basket_id IS NULL OR par IS NULL OR par < 2 OR par > 7);

-- An explicit legacy link must point into this layout, never a neighboring one.
SELECT count(*) AS invalid_legacy_links
FROM public.layout_slots s LEFT JOIN public.holes h ON h.id = s.legacy_hole_id
WHERE s.legacy_hole_id IS NOT NULL AND (h.id IS NULL OR h.layout_id IS DISTINCT FROM s.layout_id);

-- A changed endpoint cannot borrow the old legacy pairing's route.
SELECT count(*) AS linked_slots_with_changed_pairing
FROM public.layout_slots s JOIN public.holes h ON h.id = s.legacy_hole_id
LEFT JOIN public.course_tees t ON t.id = s.tee_id
LEFT JOIN public.course_baskets b ON b.id = s.basket_id
WHERE s.included AND (h.physical_hole_key IS DISTINCT FROM s.course_hole_id
  OR h.tee_lat IS DISTINCT FROM t.latitude OR h.tee_lng IS DISTINCT FROM t.longitude
  OR h.basket_lat IS DISTINCT FROM b.latitude OR h.basket_lng IS DISTINCT FROM b.longitude);

-- Works before and after context_snapshot is installed. Missing history stays
-- explicit. Size checks help assess payload cost on realistic course geometry.
SELECT count(*) AS versions,
  count(*) FILTER (WHERE to_jsonb(v)->'context_snapshot' IS NOT NULL
    AND to_jsonb(v)->'context_snapshot' <> 'null'::jsonb) AS versions_with_context,
  max(pg_column_size(v.snapshot)) AS largest_slot_snapshot_bytes,
  max(pg_column_size(to_jsonb(v)->'context_snapshot')) AS largest_context_bytes
FROM public.layout_versions v;

-- Review historical field coverage. Missing fields on old immutable versions are
-- evidence of the old contract, not authorization to manufacture historical data.
SELECT count(*) AS historical_hole_entries,
       count(*) FILTER (WHERE entry ? 'flight_path') AS entries_with_route_controls,
       count(*) FILTER (WHERE entry ? 'distance_ft') AS entries_with_distance,
       count(*) FILTER (WHERE entry ? 'tee' AND entry ? 'basket') AS entries_with_endpoint_fields
FROM public.layout_versions v
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(v.snapshot) = 'array' THEN v.snapshot ELSE '[]'::jsonb END
) AS items(entry);

SELECT count(*) AS tournament_rounds_without_pinned_version
FROM public.tournament_rounds WHERE layout_id IS NOT NULL AND layout_version_id IS NULL;
SELECT count(*) AS league_nights_without_pinned_version
FROM public.league_events WHERE layout_id IS NOT NULL AND layout_version_id IS NULL;

SELECT count(*) AS event_pins_with_wrong_layout_or_course
FROM (
  SELECT course_id, layout_id, layout_version_id FROM public.tournament_rounds
  UNION ALL
  SELECT course_id, layout_id, layout_version_id FROM public.league_events
) e LEFT JOIN public.layout_versions v ON v.id = e.layout_version_id
LEFT JOIN public.course_layouts l ON l.id = v.layout_id
WHERE e.layout_version_id IS NOT NULL AND (v.id IS NULL
  OR v.layout_id IS DISTINCT FROM e.layout_id OR l.course_id IS DISTINCT FROM e.course_id);

-- Inspect effective policies and triggers before permission/freeze assertions.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('course_holes','course_tees','course_baskets','layout_slots','layout_versions','course_features','hole_tees','hole_baskets')
ORDER BY tablename, policyname;
SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
  AND c.relname IN ('holes','hole_tees','hole_baskets','course_tees','course_baskets','layout_slots','layout_versions','tournament_rounds','league_events','rounds')
ORDER BY table_name, t.tgname;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('layout_slots','layout_versions','course_tees','course_baskets','hole_tees','hole_baskets','course_features')
ORDER BY tablename, indexname;
ROLLBACK;
