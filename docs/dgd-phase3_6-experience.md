# DGD Phase 3.6 — Player experience, familiarity and generalization

Status: shadow/admin only (`dgd-experience@0.1.0` on model `dgd-core-v1@1.1.0`). Nothing is shown to players. Phase 4 not started.

## Data structures
- Reused: `dgd_rating_events` (pre-round skill `mu_before`, latent round performance), `dgd_layout_difficulty`, `dgd_round_normalization` (layout mapping), `course_layouts` (feature metadata).
- Added: `dgd_player_layout_experience` (per player × layout counts, dates, averages, first-time/experienced performance, `familiarity_mu/sigma`), `dgd_player_experience` (breadth, generalization, diagnostics JSON). Admin read only; written by the server job.
- Code: `src/lib/dgd-v1/experience.ts`, wired in `run.server.ts`, shown in the admin inspector.

## Methodology
- **Residual**: r = (layout difficulty − score) − pre-round skill. Positive = better than general expectation.
- **Familiarity**: per layout, normal–normal shrinkage of decay-weighted residuals toward 0 (prior SD 1.5, noise 3.5 strokes). One round of +8 → under +2.
- **No double counting**: residuals are centered on the player's own mean residual, so familiarity effects sum to ~0 per player. A uniformly strong player keeps that in general skill; only *relative* layout over/under-performance becomes familiarity. Familiarity never feeds back into skill in V1.
- **Decay**: weight 0.5^(age/365 days). History counts are kept separately from current familiarity.
- **Layout changes**: a different normalized layout name/version is a separate key; transfer factor is 0 (configurable).
- **Course types**: only from mapped layout metadata (length/hole, OB, water). Wooded/open/elevation are UNKNOWN — no source data. Type effects use the same shrinkage (prior SD 1.0).
- **Course Breadth**: Σ per-layout evidence 1−e^(−n/3) (one round ≈ 0.28 of a layout), + competitive-layout and type-diversity bonuses, scaled 100·(1−e^(−E/40)).
- **Generalization Confidence**: 100·(1−e^(−effective layouts/6)) × (0.6 + 0.4 × share of rounds on mapped layouts). Separate from rating confidence.
- **Adaptability**: mean residual on the first 1–3 rounds at a layout; only reported with ≥5 independent layouts.
- **Leakage**: all experience is computed from rounds strictly before the predicted round / holdout cutoff.

## Results (run dfc0edfd, 2 calibration players)
| Metric | Player 1 | Player 2 |
|---|---|---|
| Eligible rounds | 563 | 303 |
| Unique layouts / courses | 157 / 91 | 130 / 85 |
| Effective layouts | 76.7 | 54.3 |
| Course Breadth | 90.2 | 77.7 |
| Generalization confidence | 60.5% | 61.2% |
| Primary layout share | 11.9% | 12.9% |
| Familiarity advantage (home − away) | +1.00 ± 1.25 | −2.49 ± 0.96 |
| First-time / familiar perf | −0.39±0.84 / +1.13±0.65 | +0.28±0.91 / +0.91±0.52 |
| Adaptability | −0.48 ± 0.62 | +0.74 ± 0.69 |

Only 9 of 241 layouts have a known archetype, so course-type diagnostics are near-empty.

## Validation (chronological holdouts, mean MAE over 4 cutoffs)
| Variant | Mean MAE | Gain vs V1 |
|---|---|---|
| A. DGD V1 | 7.55 | — |
| B. + familiarity | 7.69 | −0.13 (worse) |
| C. + course type | 7.54 | +0.01 (noise) |
| D. + both | 7.69 | −0.13 (worse) |

Familiarity is worse on home/frequent layouts (e.g. 5.17 → 6.50 at the first cutoff) and identical on unfamiliar ones (no training residual → 0). Activation threshold: 0.1 strokes of gain. Not met.

## Limitations
2 players; 69% unmapped layouts; only 9 layouts with features; no wooded/elevation data; residual against a lagging pre-round skill partly captures improvement over time, not familiarity.

## Recommendation
Keep familiarity and course-type effects out of DGD V1. Keep them as admin diagnostics, revisit in a V2 once there are many players and mapped layouts.
