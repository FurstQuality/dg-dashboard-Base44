# Course publication database checks

Run from the repository root:

```powershell
npm ci --prefix scripts/course-builder-db --ignore-scripts
npm test --prefix scripts/course-builder-db
```

This isolated test package pins [PGlite](https://pglite.dev/docs/) to 0.5.8. It runs SQL against an in-memory PostgreSQL database, requires no credentials, and never connects to Supabase. Its dependencies do not enter the application's runtime package.

The harness installs the canonical tables, permissions, and original publisher from migration 0035, reproduces an unset-par publication, then applies `20261009142843_course_layout_publication_snapshot_safety.sql`. It also installs the checked-in `event_has_capability` body from migration 0060. Each scenario runs in a transaction and rolls back.

Covered behaviors include server readiness checks, asset ownership, invalid coordinates, authorization, version protection, exact control-point/pin/measurement JSON capture, selected feature layers, old snapshots without context, event overlay isolation, director notes, and snapshot stability after subsequent course edits.

`fixture.sql` supplies the surrounding schema and ownership/hosting lookups. It does not reproduce every deployed policy or shared-asset trigger. PGlite has one connection, so sequential version allocation here does **not** verify concurrent publishers. Live schema compatibility, multiple-connection contention, actual event ownership and staff assignments, direct table RLS, cascade-delete workflows, query plans, and frozen historical consumers still require authorized staging verification.

The migration preserves the existing array in `layout_versions.snapshot`. A nullable `context_snapshot` captures source rows once per version, including versioned Studio JSON and the selected course features. Event snapshots copy it into `layout_context`. Older versions remain `NULL`; consumers must keep missing historical geometry unknown. `captured_source` means the raw source was retained, not that the SQL publisher calculated or validated a rounded route or a measured distance. Historical consumers must use the strict Studio resolver with the snapshot's selected pairing/par and must not fetch current course geometry to fill gaps.

The version freeze also blocks cascade deletion of published layouts/courses. Archive those records rather than deleting their historical versions. Explicit event snapshot rebuilding remains an existing director action; its lifecycle restrictions must be verified before deployment.

The migration is prepared and locally tested, **not applied to the connected project**. Audit deployed definitions first, then verify it in an authorized staging copy. It does not fix the separate legacy-route propagation issue in `save_layout_slots` / `sync_layout_legacy_holes`.
