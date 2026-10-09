# DGD Phase 2 — Canonical Performance Data

Status: complete. Additive only — no existing table, column, or source value was changed.

## Tables
| Table | Purpose | Writes |
| --- | --- | --- |
| `player_external_identities` | PDGA / UDisc / Scene IDs per player | service role |
| `source_round_records` | Immutable snapshot of each source row (payload + md5 hash) | service role |
| `canonical_rounds` | One row per physical round; eligibility rated / practice / ineligible | service role |
| `canonical_round_sources` | Links source rows → canonical round with match level | service role |
| `round_import_jobs` | Each canonicalization run: seen, created, linked, possible duplicates, error | service role |

Users can read only their own rows. `canonicalize_user_rounds(uuid)` and `canonicalize_pending_users()` are executable by service role only (triggers call them internally).

## Deduplication
- **Certain**: same source row already linked → skipped (makes reruns idempotent).
- **High**: same player, same day, same score, from a different source, and the course matches or one side is PDGA (PDGA rows carry the event name, not the course). Merged; the real course name is kept.
- **Possible**: same day + score that doesn't qualify as high → new round, `has_possible_duplicate = true`. Never auto-merged.

Eligibility: non-singles or PDGA `included = false` → ineligible; in-app `is_rated = false` → practice.

## Triggers
- After an `external_rounds` insert (per statement) and when a `rounds` row becomes completed, the affected players are canonicalized. Failures only raise a warning and never block the import.
- After a source row is deleted, its link is removed, plus the canonical round once nothing backs it.
- Daily 04:15 UTC reconciliation backstop: `canonicalize_pending_users()`.

## Backfill reconciliation (2026-10-02)
| Check | Result |
| --- | --- |
| external_rounds rows | 1,318 |
| Source links created | 1,318 (0 unlinked) |
| PDGA↔UDisc true pairs (same day + score) | 9 |
| Merged as high confidence | 9 |
| Canonical rounds | 1,309 (337 + 972 across 2 players) |
| Flagged possible duplicates | 15 |
| Source rows modified | 0 |

## Next (Phase 3)
The DGD engine reads `canonical_rounds` + `canonical_round_sources`, so each physical round counts once.
