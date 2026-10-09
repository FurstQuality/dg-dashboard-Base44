# DGD Performance Intelligence — Phase 1 Audit

Status: Phase 1 complete. No visible Statboard changes. Phases 2–3 not started.

## Statboard surfaces
| Surface | Path | Data source |
| --- | --- | --- |
| Statboard page (ratings / rounds / scoring) | `src/routes/_authenticated/stats.tsx` | `src/lib/stats.functions.ts` |
| Rating snapshot | `getRatingSnapshot` | `external_rounds`, `profiles`, `courses` |
| All ratings board | `components/statlink/all-ratings-board.tsx` → `getAllRatings` | `profiles`, `external_rounds` |
| Round database | `components/statlink/round-database.tsx` → `getSourceRounds` | `external_rounds`, `round_ratings`, `rounds`, `courses` |
| Target / impact tools | `target-simulator.tsx`, `rating-impact-calculator.tsx` | `getTargetPlan`, `rating-projection.functions.ts` |
| Lifecycle / methodology | `rating-lifecycle-panel.tsx` | static + snapshot |
| Scoring, skills, discs, courses | `getScoringStats`, `getShotStats`, `getSkillEngine`, `getCourseMastery`, `getDiscPerformance` | `round_scores`, `rounds`, `user_discs` |

All Statboard reads are server functions with user-scoped clients; nothing recalculates in the database on page load.

## Rating data — source of truth
| Concept | Stored in | Written by |
| --- | --- | --- |
| Official PDGA Rating | `profiles.pdga_rating` | `pdga-lab.functions.ts` (PDGA profile sync), `pdga-sync.ts` |
| Official PDGA Round Ratings | `external_rounds` (source = pdga) | PDGA import |
| UDisc Round Ratings / history | `external_rounds` (source = udisc) | `import-rounds.functions.ts` |
| DG Dashboard rounds | `rounds`, `round_scores`, `round_ratings` | in-app scoring |
| DGD Rating (current, legacy) | not stored — computed per request | `computeDgdRating` in `src/lib/stats/rating-engines.ts` |

Engines: `rating-engine.ts` (PDGA method), `rating-engines.ts` (`computePdgaRating`, `computeUdiscRating` filter strictly by source; `computeDgdRating` builds on an all-source pool).

## Findings / technical debt
1. No canonical round: one physical round imported from PDGA and UDisc exists twice in `external_rounds`. DGD's all-source pool can double-count it. → Phase 2.
2. DGD is recomputed on every request and has no history, versioning, or ledger. → Phase 3.
3. `profiles.pdga_rating` is only written from PDGA lookups — no path writes DGD or UDisc values into it (verified by search).
4. Course/layout identity is name-based in places (`course` string key for home/away). → Phase 2 layout mapping.
5. Legacy DGD includes a head-to-head shift and distribution bonus; Phase 3 v1 runs beside it in shadow mode, not as a replacement.

## Protection added
- `src/lib/__tests__/rating-source-separation.test.ts`: PDGA ignores UDisc/app rounds, UDisc ignores PDGA/app, DGD computation never mutates source results, no borrowed ratings, doubles excluded.
- Existing `dgd-rating.test.ts`, `rating-agreement.test.ts`, `rating-projection.test.ts` remain the baseline.

## Migration strategy (Phase 2)
Additive only: new identity, raw source record, canonical round, round-source link, and import job tables with owner-only RLS. Backfill from `external_rounds` + `rounds` with a reconciliation report; source rows are never modified.
