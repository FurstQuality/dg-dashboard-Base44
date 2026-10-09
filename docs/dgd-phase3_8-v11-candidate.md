# Phase 3.8 — DGD Core V1.1 Candidate (shadow only)

Control: `dgd-core-v1@1.1.0` (the hardened V1 lineage; `1.0.0` row also kept). Candidate: `dgd-core-v1.1-candidate@0.1.0`, own model-version row, status shadow. V1 config, events (3,466) and player states are untouched. Display stays `UNCALIBRATED_DISPLAY_TRANSFORM`. Phase 4 not started.

## A–B. Personal PDGA importer
- `importPdgaRounds` now uses the shared label-based reader (`dgd-v1/pdga-details.ts`). The old position-guessing parser is gone.
- New field checks before storing: score missing, score ≥300 (a rating), rating <300 (a score), score below hole count, to-par outside −30..+60, implausible date. Failing rows are rejected and counted.
- Matching existing rows: date + event + score, one stored row consumed per parsed round. Only PDGA-owned flags (rating, included) are refreshed; score/date/event are never rewritten.
- Dry-run audit (2 linked players, 284 stored rows vs today's PDGA pages): 216 match exactly, 0 rating revisions, 68 don't exist on PDGA. Of those, 67 are copies of a good row with a wrong date (50 dated 2001-0N-01 from the round number, others with division "MPO" as the event name) and 1 has no good twin. 23 of the 68 currently feed V1 as rated rounds. **Nothing was corrected — awaiting approval.**

## Method (E–J)
Prequential, leakage-free: rounds processed in date + round order; each is predicted from state before it. First 20% of dates is burn-in. 7,620 rounds, 6,057 scored, 51 players.
- **B robust update:** Huber down-weighting when |z| > 2 plus a cap of 0.35 on any single round's gain. Drift (0.02/day variance) is kept.
- **C cold-start hierarchy** (layouts with <3 rounds): exact history → event-round field (leave-one-out, weighted by 1/(σ_obs²+σ_player²), ×1.5 σ when <5 others) → course family (par + family offset) → structural (weighted fit of difficulty on par and ft/hole, refit monthly on earlier layouts, σ ≥ 3 or 1.5× residual) → population (σ 8). Precision-weighted.
- **D trend:** EWMA of standardized residuals; after ≥3 same-sign rounds and |EWMA| ≥ 0.8, adds process variance.
- **E volatility:** player residual variance shrunk toward 3² (weight 8); used for observation noise and prediction ranges.
- **F:** components whose paired 95% CI is fully better, or (interval-only) accuracy unchanged and 80% coverage within 5 points while control misses. Selected: B + C + E.

## Results (average miss, strokes)
| Group (n) | Layout | Recent 20 | Player+layout | A V1 | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|---|
| Overall (6,057) | 6.11 | 5.57 | 5.57 | 5.54 | 5.51 | 5.37 | 5.56 | 5.54 | **5.32** |
| Established layout (3,811) | 5.94 | 5.10 | 5.16 | 5.14 | 5.13 | 5.14 | 5.14 | 5.15 | 5.09 |
| Cold-start layout (1,081) | 7.39 | 7.02 | 6.99 | 7.21 | 7.13 | 6.37 | 7.21 | 7.21 | **6.33** |
| After 90+ day break (270) | 6.25 | 5.97 | 5.95 | 6.13 | 6.00 | 5.85 | 6.26 | 5.94 | **5.64** |
| Rapid improvers (748) | 5.76 | 5.82 | 5.84 | 5.63 | 5.60 | 5.31 | 5.66 | 5.62 | **5.26** |
| Stable (955) | 5.20 | 5.04 | 4.96 | 5.14 | 5.06 | 4.97 | 5.16 | 5.13 | **4.89** |

Paired |error| vs V1 (player-clustered bootstrap 95% CI): B −0.03 [−0.05, −0.01]; C −0.17 [−0.22, −0.13]; D +0.02 [−0.00, +0.04]; E +0.00 [−0.03, +0.04]; F −0.22 [−0.27, −0.19], better for 94% of players, 53% of rounds. F RMSE 6.91 vs 7.21.

## Movement (|skill change| per round)
- V1: p50 0.42, p95 2.18, p99 4.77, max 17.2; >3 strokes 208 (established 63, after break 45).
- F: p50 0.27, p95 1.40, p99 3.09, max 9.9; >3 strokes 81 (established 3, after break 9, new players 69).
- D (trend) roughly doubled large moves (>3: 392) without better predictions — rejected.

## Post-break (V1 → F)
365+ days (16): gain 0.42 → 0.25, skill change 3.5 → 1.7, first-round miss 8.35 → 7.63, next-5 5.87 → 5.74. Same direction at 30/60/90/180 days.

## Responsiveness (positive runs ≥3 strokes over expectation, same sequences)
Skill change after 1/3/5 rounds: V1 0.8/2.3/3.5, F 0.5/1.3/2.1. F moves slower yet predicts the next 5 rounds better (5.31 vs 5.48). Trend mode moved faster (1.1/3.0/5.7) and predicted worse (5.56).

## Intervals / confidence
80% range hit rate: V1 55% (needs 1.74× wider), F 81%, 50%: 52%, 95%: 94%. V1 confidence bands are inverted: 85–100% confidence rounds hit their 80% range only 50% of the time. Player residual SD median 7.1 strokes (p10 5.9, p90 8.4) vs the assumed 3.

## Event field / mapping
181 field estimates; median 4 other players (cohort overlap is small). Layout levels used by F: established 3,840, provisional 1,167, field 172, structural 244, population 2,197, family 0. No unlisted-layout round could be mapped safely (0 high-confidence), so they stay separate.

## PDGA reference (not optimized)
Skill vs official rating r 0.86 → 0.90; round performance vs round rating r 0.61 → 0.62.

## Weaknesses
52 hand-picked players; small fields; family level never fired; prequential protocol differs from Phase 3.7's cutoff protocol (V1 numbers here are online, not batch-fitted); rapid/stable groups use Phase 3.7 labels from full history (grouping only).
