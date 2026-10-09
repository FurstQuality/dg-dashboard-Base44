# Course Builder Implementation Progress

Course Studio now has locally verified fixes for shared fairway rendering, distance consistency, layout readiness, save protection, and tee signs. Full production readiness remains blocked by access to the connected Supabase project. The research brief's survey, maintenance, and advanced 3D stages are not completed by this pass.

Status recorded October 9, 2026. The [design reference](course-builder-design-reference.md) defines the target capabilities and diagrams; the [canonical model](canonical-model.md) and course module rules govern storage and permissions.

## Completed core changes

| Area | Result | Evidence |
|---|---|---|
| Shared curves | A prepared geometry context indexes a draft once, samples each shared edge once, and reuses lengths and score summaries. Reverse traversal follows the same curve. Edits rebuild the context. | Unit coverage, shared-route browser checks, synthetic benchmark |
| Fairway preservation | Temporarily unplacing a primary tee or basket preserves its control points and identities. Invalid primary, alternate, and archived route data is rejected before a save can discard it. | Serialization and unplace/re-place regressions; failure/retry browser checks |
| Placement tools | Fairways and endpoint markers stop intercepting placement clicks when the tool changes. Native dragging remains stable across ordinary preview renders. | Endpoint-role and rounded-fairway browser checks |
| Layout distances | Explicit legacy-hole links resolve the same mapped curve as Studio. Draft endpoint changes use a labelled direct distance instead of borrowing the old pairing's route. Incomplete measurements produce an unknown total. | Unit tests and Layout Studio browser check |
| Layout scoring | Selecting another tee/basket clears the old par and route in the draft payload. Invalid or unset par blocks client publication. Pars from 2 through 7 are supported consistently. | Pair-scoring tests, invalid-par and pairing-switch browser checks |
| Layout saves and history | Rules remain in save payloads. Row, bulk, history, and detail controls are guarded while saving/publishing. Failed saves retain the draft. Restoring repeated physical holes preserves distinct slot IDs; malformed snapshots are rejected. History read failures show retry controls. | Restore regressions; save failure, busy-control, and retry browser checks |
| Maps and signs | Current-course maps, course-map signs, printed signs, and distance matrices use the Studio resolver. Each pairing keeps its own par and measured override. Unassigned or corrupt routes stay unknown and require review. | Consumer geometry tests, rendered SVG assertions, sign browser checks |
| Sign data and phone layout | Required read failures show a retry panel instead of incomplete signs. Shared ground copies collapse, selected rules remain distinct, and ordinary signs exclude event-only features. Phone actions wrap, including Print; pin confirmation text fits its panel. | Rule-selection tests; four read-failure/retry scenarios; desktop/phone screenshots |

The active route model remains versioned JSON in `hole_tees.flight_path` and `hole_baskets.split_point`, with editable controls retained in existing storage. The changes do not activate the separate experimental route tables or replace the approved automatic nearby joins.

## Validation

- Full unit suite: **124 files and 1,018 tests passed**.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed. Repository build output includes TanStack server-function deprecation warnings.
- Scoped ESLint passed for the prepared geometry, route preview, layout measurements/rules, pair scoring, and new regression tests.
- Isolated browser checks passed for rounded routes and shared snapping; pairing metadata; save failures and retries; compact layout editing and mobile GPS placement; endpoint roles; layout readiness and save protection; and sign geometry/read recovery.
- Isolated PostgreSQL publication checks: **36 regression scenarios passed** (37 Node test entries including the parent). These are separate from the application unit suite above. The read-only audit also executes before and after the new context column exists.

Browser checks replace the Supabase client with local fixtures and block external requests. They exercise the real React components without changing production data. They do not prove deployed RPC behavior, RLS, shared-asset triggers, or frozen historical snapshots. Fixture scripts and screenshots remain in the ignored `.migration-check.local` directory.

The curve benchmark used 64 assigned routes sharing 21 edges, with 17 samples per edge. Median calculation time over nine samples of three iterations each was **15 ms using repeated compatibility calls versus approximately 0.17 ms using one prepared context**. Outputs had the same checksum. This is a synthetic calculation benchmark, not a measurement of total page load, browser frame time, or live database performance.

## Prepared database correction

The [publication/snapshot migration](../supabase/migrations/20261009142843_course_layout_publication_snapshot_safety.sql) is prepared and executed against a disposable local PostgreSQL fixture. It has **not** been applied to the connected project.

It rejects empty or incomplete playable layouts, invalid asset ownership/physical-hole references, and malformed coordinates. Publishers lock the layout row before allocating a version; validation and capture share one SQL statement. An immutable-version trigger blocks updates/deletes, including service-role changes. Published layouts/courses must be archived rather than cascade-deleted.

The existing slot snapshot array remains compatible. A nullable `context_snapshot` retains the exact linked source controls, versioned tee/basket JSON, pin identities, measured metadata, selected canonical assets, shared ground, and played rules once per version. Event snapshots copy that context into `layout_context` and isolate their own overlays. Old versions remain without context; no historical rows are repaired with current geometry. Source capture does not certify a valid curve or calculate its rounded length. Historical consumers still need the strict Studio resolver and the selected slot's par.

The [reproducible database harness](../scripts/course-builder-db/README.md) loads the real canonical schema/publisher from migration 0035 and the real capability function from 0060. It reproduces the old unset-par publication and verifies the correction, permissions, immutable versions, exact JSON capture, director notes, wrong version pins, and tournament/league snapshot stability after course edits. Course leads pass `event.manage_course_ops`; scoring staff and explicit revocations fail.

The harness has one connection and fixture ownership/hosting lookups. Concurrent publication, deployed shared-asset triggers/RLS, event snapshot rebuild lifecycle, query plans, and historical consumers remain staging requirements. The separate layout-save route propagation defect is not fixed by this migration.

## Database release gates

The connected Supabase account denied access to project `ypeebzwggcsyfvafpifa`. No migration was applied there, and no production write, commit, push, or deployment was performed. The [read-only audit script](../scripts/course-builder-db-audit.sql) is prepared for an authorized staging copy; it has not been executed against that project. Other projects listed by the connected account are unrelated and were not used as staging.

| Gate | Repository evidence and required verification |
|---|---|
| Preserve selected route on layout save | The latest checked-in `save_layout_slots` definition in migration 0037 does not insert `flight_path` and preserves old legacy links independently of a changed pairing. `sync_layout_legacy_holes` in 0036 can retain the old route through `COALESCE`. Inspect deployed definitions, then verify changing Blue/A to Red/B resolves the intended route and preserves all unrelated pin identities. The client's cleared payload alone cannot prove this. |
| Validate publication on the server | The original `publish_layout` in 0035 lacks readiness checks. The prepared correction passes local direct-SQL validation and permission scenarios. Audit deployed definitions and test it in staging, including distinct versions under concurrent publishers. |
| Freeze complete geometry and scoring | The prepared correction captures linked raw geometry, metadata, and selected feature context without rewriting old snapshots. Verify deployed schema compatibility, data coverage and strict resolver behavior before historical consumers adopt the new fields. |
| Preserve old and active events | In staging, publish a version, pin it to tournament and league rounds, capture `rules_snapshot`, then change bends, basket positions, pair scoring, and event overlays. Earlier version/snapshot bytes must remain unchanged. Existing historical omissions must stay explicit; do not manufacture or rewrite past geometry. |
| Verify database permissions and performance | Exercise steward, draft creator, ordinary player, and unauthorized writes through the deployed RPCs and RLS. Check triggers for shared-asset moves and version protection. Review indexes and query plans for bulk slot/pin/feature reads with realistic courses. |

These are release requirements, not passed checks. Verify deployed definitions first; do not replace them based solely on repository SQL or run recovery SQL for unrelated courses.

## Remaining research stages

The next capability stages retain the design reference's order:

1. Finish the database gates and align all historical/scoring consumers with complete pinned configurations.
2. Add traceable field measurements: throwing-edge observations, survey imports, datum and accuracy, dated evidence, and elevation profiles with explicit unknowns.
3. Extend course operations beyond the existing conditions/proposal workflows with inspections, work orders, and dated equipment placement history.
4. Add useful 3D and modeled views once their inputs and uncertainty are defined.

The existing recovery incident remains separate from this completion pass. Its [Rogers Lakewood report](recovery/rogers-lakewood-2026-10-09-incident.md) requires owner-authorized backup/history inspection; prevention fixes and local fixture results do not establish recovered live assets.
