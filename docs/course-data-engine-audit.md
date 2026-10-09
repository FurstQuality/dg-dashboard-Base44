# Course Data Engine — schema audit (step 1–2)

Spec: docs/master-phase-course-data-engine.md. Rule: reuse existing tables, no *_v2 tables.

| Spec stage | Existing owner |
|---|---|
| Canonical course | courses (merged_into_course_id for joined duplicates) |
| Source links | course_sources (unique course_id+source, canonical_url) |
| Source snapshot / reparse | source_snapshots (content-hash dedupe, via src/lib/data-intel/snapshots.server.ts) |
| Field provenance | field_observations (supersede, never delete) |
| Matching / review | course_match_candidates (pending/same/different), find_duplicate_courses |
| Location resolution | courses.location_quality, geo-backfill cron, unlocated queue |
| Physical holes / tees / baskets | holes, hole_tees, hole_baskets (course_holes/course_tees/course_baskets are older parallels — check before use) |
| Layouts / versions | course_layouts, layout_slots, layout_versions |
| Course features | course_features (layer base/layout/event/condition) |
| Ingest jobs | course_ingest_jobs, ingest_queue, ingest_runs, ingest_state |
| Mapping queue | courses_needing_mapping RPC → Course Studio |

## Snapshot (Oct 6 2026)
- 12,563 canonical courses; 12,562 have a layout row.
- Location: 60 on-site GPS, 6,192 from a source listing, 5,752 town-centre, 559 unknown.
- Source links: UDisc 12,144, PDGA 912, Disc Golf Scene 0.
- 1,962 stored source snapshots; 1,354 field observations.
- 197,630 holes; 38 with confirmed par.
- 119 possible-duplicate pairs waiting for review.

## Gaps
1. No Disc Golf Scene course adapter.
2. Adapters are not behind one interface; no parser version on snapshots.
3. Older parallel tables (course_holes/course_tees/course_baskets) need a decision.
4. Par provenance: nearly all par is unconfirmed default.
5. No layout detection or auto-layout builder from source hole data.
6. No admin Course Data Engine view showing each stage's counts and failures.

## Decisions (Oct 7 2026)
- course_holes / course_tees / course_baskets are NOT dead: Layout Studio uses them as the physical hole/tee/basket model (layout_slots.course_hole_id/tee_id/basket_id). Keep them; `holes` stays the per-layout scoring row.
- Listing adapters live in src/lib/course-sources/ (one interface; parser_version on every snapshot). Background pass in geo-backfill re-reads UDisc/Scene listings every 30 days and fills unconfirmed par only when hole counts match (holes.par_source labels it).
- Scene links come from Scene tournament venue links matched to one course within 2 km by name; ambiguous venues are skipped and recorded.
