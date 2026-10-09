# DGD V1 — Phase 3.5 data & model hardening

Model `dgd-core-v1@1.1.0` (shadow). `1.0.0` rows are kept, not deleted. Display scale status: PLACEHOLDER / UNCALIBRATED.

## A. Round reconciliation
Phase 3 (1.0.0): 1,318 source records → 1,309 canonical (9 PDGA+UDisc merges). 879 eligible + 430 unique not-eligible = 1,309.
The reported 448 was a sum of reason counts; 18 rounds carried two reasons (15 ineligible+possible duplicate, 2 ineligible+implausible score, 1 implausible score+to-par), so 448 − 18 = 430.

Phase 3.5 (1.1.0, run 2026-10-02):
| Item | Count |
|---|---|
| Source records | 1,318 (all linked) |
| Canonical physical rounds | 1,249 (60 malformed PDGA rows linked into their clean twin) |
| Evaluated | 1,249 |
| ELIGIBLE | 868 |
| INELIGIBLE | 21 |
| PENDING_REVIEW | 0 |
| EXCLUDED | 360 |
| Possible duplicates flagged / unresolved | 15 / 0 |
Overlapping blocking codes: DOUBLES+INCOMPLETE_SCORE 2, IMPOSSIBLE_SCORE+IMPOSSIBLE_SCORE_TO_PAR 1.
State precedence: EXCLUDED > INELIGIBLE > PENDING_REVIEW > ELIGIBLE. Stored in `dgd_round_eligibility.state` + `reason_codes`.

## B. Impossible scores (23 + 1)
22 are rounds stopped early (par played 3–16, i.e. 1–5 holes; 4 have matching hole rows). Cause: incomplete UDisc scorecards, not mapping errors. Now `INCOMPLETE_SCORE`.
1 is 141 (+75) on "DOOMSDAY X2": unusual format or manual entry — stays INELIGIBLE, flagged NEEDS_REVIEW.
Separately found: 65 PDGA rows with shifted columns (dates 2001-0R-01 where R = round number, `evaluated_on` year = rating, course = division or event). 26 of them were counted in Phase 3, double-counting real rounds. 60 linked to their clean twin (same score + round rating, unique match); 5 with no twin are EXCLUDED as MALFORMED_SOURCE. Source rows unchanged. The PDGA importer still needs fixing.

## C. Duplicates (30)
15 LINK (malformed PDGA twins), 15 KEEP_SEPARATE (10 UDisc pairs at different courses the same day; 5 whose counterpart was linked away), 0 NEEDS_REVIEW. Stored in `dgd_duplicate_reviews`.

## D. Hole count
Known 23.7% (hole-score rows), inferred 7.1% (layout name / pinned holes, checked against par), unknown 69.2%. Never defaulted to 18. Unknown widens observation sigma ×1.15.

## E. Layout mapping
318 source layout aliases; 41 courses and 10 app layouts matched. Rounds: EXACT 10, HIGH_CONFIDENCE 7 (1.4%), POSSIBLE 372 (29.8%, sigma ×1.15, cannot reach Established), UNMAPPED 860 (68.9%). Most PDGA rows carry the event name, not the course.

## F. Layout diversity
241 layouts; median 1 round, 1 player; max 2 players; effective players mean 1.14; 0 layouts with ≥3 effective players. States: unrated 168, provisional 55, developing 18, established 0. Established needs ≥20 rounds, ≥3 effective players and a safe mapping (config).

## G. Convergence
Phase 3 measured change before re-centring, so the shift from re-centring never settled under 0.01 within 200 iterations. Now measured after re-centring, both player and layout max change must fall below 0.001; cap 5,000. Result: CONVERGED in 10 iterations (max skill Δ 0.00023, max layout Δ 0.00045). Stored on `dgd_calc_runs`.

## H. Leakage-free holdout (MAE / median / RMSE, n)
Cutoffs at 60/70/80/90% of the timeline; players and layouts trained only before each cutoff; frozen.
| Cutoff | n | A layout | B history | C recent | D player+layout | E DGD V1 |
|---|---|---|---|---|---|---|
| 2025-02-09 | 348 | 8.21/6.24/11.09 | 8.44/6.07/11.56 | 10.97/9.10/14.47 | 8.22/6.29/11.27 | 8.18/6.09/11.21 |
| 2025-07-27 | 261 | 8.13/5.83/11.22 | 8.52/6.25/11.71 | 9.11/6.70/12.70 | 8.27/5.67/11.44 | 8.06/5.89/11.20 |
| 2026-02-10 | 174 | 7.28/6.00/9.49 | 7.65/5.50/10.18 | 8.79/7.20/11.26 | 7.15/5.47/9.44 | 6.82/5.06/9.36 |
| 2026-06-02 | 91 | 8.03/6.00/10.28 | 7.85/5.22/10.50 | 8.06/5.90/10.71 | 7.48/5.40/9.97 | 7.04/5.25/9.61 |
59–61% of test rounds are on layouts unseen in training; there E is not better than A. All test players are "known" (2 players), so no new-player breakdown exists. No superiority claim.

## I. PDGA comparison
Pearson r (−1..+1) between DGD round performance (layout difficulty − score, strokes) and the official PDGA round rating, one pair per eligible canonical round. n = 80, r = +0.50, Spearman ρ = +0.52, slope 2.6 rating points per stroke, residual SD 28.8, 1 outlier > 2.5 SD. Phase 3's 0.51 was the same Pearson r on 99 pairs that included the double-counted malformed rows. Diagnostic only.

## J. Cold start
Layout sigma now adds confounding²/effective players (4²/n_eff), so single-player layouts keep ≥4 strokes of uncertainty. Weight of one round for a player at sigma 2: unseen 0.08, provisional single-player 0.13, 20-round single-player 0.14. Observed mean update weight: unrated 0.042, provisional 0.054, developing 0.055.

## K. Security
See final report in chat; fixed: duel self-award, print-window injection, post media storage scoped to post visibility.
