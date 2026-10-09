# DGD Phase 3.7 — Calibration cohort (shadow only)

Model tested: `dgd-core-v1@1.1.0`. The model was not changed. Display numbers are `UNCALIBRATED_DISPLAY_TRANSFORM`.
Phase 4 has not started.

## Cohort
- 52 PDGA players added by PDGA number from public PDGA player-detail pages. 50 have at least 10 rated rounds.
- PDGA rating range is 763–992, median 910. Bands: <850 = 7, 850–899 = 15, 900–934 = 14, 935–969 = 10, 970+ = 4.
- The cohort has 7,636 rounds. 7,619 are eligible. 16 doubles rounds were excluded, and 1 round had no score.
- Calibration players are stored as admin-only subjects keyed `cal:<id>`. They have no accounts or public profiles. A subject links to a real user only when exactly one profile has the same PDGA number.
- Admin notes are kept in their own table, and no calculation reads them.

## Layout identity
- 5,395 rounds were played on one PDGA layout, and those rounds are matched as exact layouts.
- 76 rounds came from events with several pools, so we can't tell which pool the player threw. Those rounds are marked as possible matches.
- 2,165 rounds had no layout listed. Those rounds stay unmatched, and their hole count is unknown.
- 2,232 layouts were fitted, and the fit converged in 22 iterations. Most layouts have only one cohort player.

## Results
- Player level: DGD skill vs official PDGA rating gives r = 0.84 and Spearman 0.84. This is a diagnostic only, not a target.
- Round level: DGD round performance vs PDGA round rating gives r = 0.63.
- Confidence median is 82%. Two players were flagged as more confident than their evidence supports.
- Responsiveness, measured as median skill movement during runs of strong rounds: +0.6 strokes after 1 round, +1.9 after 3, +2.5 after 5.
- Recency: rounds older than a year carry a median of 4% of a player's skill weight.
- Large single-round jumps: 115 rounds moved skill by more than 3 strokes, and 6 rounds moved it by more than 8. These jumps mostly follow long gaps between events, which widen uncertainty.

## Holdout (leakage-free, 4 date cutoffs, average miss in strokes)
| Cutoff | Layout only | Player long-term | Recent 10 | Recent 20 | Player+layout | DGD V1 |
|---|---|---|---|---|---|---|
| 2023-09 | 6.35 | 6.48 | 6.45 | 6.44 | 6.50 | 6.69 |
| 2024-08 | 6.23 | 5.89 | 5.77 | 5.81 | 5.87 | 5.79 |
| 2025-07 | 6.23 | 6.01 | 6.12 | 6.00 | 6.07 | 6.27 |
| 2026-04 | 6.40 | 5.54 | 5.88 | 5.47 | 5.58 | 5.65 |

DGD V1 is not clearly better than simple player baselines. It is weakest on layouts it hasn't seen before.

## Caveats
- A PDGA "layout node" is the layout as published for that event. Tee or pin changes inside one node are not visible.
- The cohort was selected by hand, not sampled at random.
