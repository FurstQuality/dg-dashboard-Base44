# Phase 3 — DGD Core V1 (shadow)

Model: `dgd-core-v1@1.0.0`, status SHADOW. Config lives in `rating_model_versions.config`; engine defaults in `src/lib/dgd-v1/engine.ts` mirror it. Players still see DGD Legacy.

## Ownership
- PDGA: official rating, round ratings, window. UDisc: imported rounds/values.
- DGD Legacy: existing Statboard DGD Rating and the "UDisc projected rating" (`UDISC_PROJECTION_OWNER = "dgd_legacy"`). Unchanged.
- DGD V1: Performance Rating, Round Performance, Form, Confidence, Expected Score, Strokes vs Expectation.

## Data path
canonical_rounds (one physical round) → eligibility check → observation. Unknown values stay null (to_par, hole count). to_par is taken only from a linked source whose score equals the canonical score.

Ineligible when: canonical eligibility ≠ rated, possible duplicate, score unknown/≥600 (rating in score)/outside 18–130, to_par ≥600 or outside −30..+60, holes < 9 when known, course unmapped. Source rows are never deleted.

## Math
- Layout key = course_key + normalized layout name (`?` when unknown → observation σ ×1.25). Unknown hole count → σ ×1.15.
- Layout difficulty d = expected score of a population-average player. Fit by anchored alternating shrinkage (d toward global mean with k=3 pseudo-rounds; player offsets toward 0 with k=2; recentred so the round-weighted mean offset is 0), stop at max change < 0.01 or 200 iterations. Frozen per model version in `dgd_layout_difficulty`; σ_d = 1/√(1/6² + n/3²). Status unrated <3, provisional 3–9, established ≥10.
- Observation: round_mu = d − score; σ_obs = clamp(√(3² + σ_d²)·mults, 2, 12).
- Drift: σ_prior = √(σ² + 0.02·days). Inactivity never moves μ.
- Update: precision-weighted posterior; σ floor 0.75.
- Expected score = d − μ_before; strokes vs expectation = expected − actual (positive = better).
- Display = clamp(50 + 2.5·μ, 0, 100) — provisional, not population-calibrated.
- Form = EWMA of round performance (half-life 30d, lookback 365d, needs ≥2 effective obs, else null).
- Confidence = 100·clamp(1 − σ_now/8). Established when σ_now ≤ 2.5. Effective observations = Σ 3²/σ_obs².

## Replay, idempotency, audit
Each run fully replays each changed player chronologically (so late imports land in date order). Unchanged players are skipped by input hash. Writes go through `dgd_v1_apply_player` in one transaction: prior active events are marked superseded (`replay:<run>`), never deleted; a partial unique index allows one active event per player/round/model/calc type.

## First run (2026-10-02)
1,309 canonical rounds, 879 eligible (67.2%); 100% of source rows canonicalized. Ineligible: 394 canonical-ineligible (doubles/excluded), 30 possible duplicates, 23 implausible scores, 1 implausible to-par. 239 layouts (19 established). Prequential MAE 6.99 strokes; chronological holdout MAE 6.52 vs 6.70 layout-only baseline (91 test rounds; 85 more were on layouts unseen in training). Round performance vs PDGA round rating r = 0.51 (99 pairs). 0 failed jobs.

## Known weaknesses
- Only 2 players with rounds: layout difficulty is largely relative to these two; population anchoring is not meaningful yet.
- Layout fit hits the 200-iteration cap without meeting 0.01 tolerance (slow ALS with two players).
- Layout names from imports are inconsistent; many layouts have <3 rounds.
- Hole count is unknown for all imported rounds; 9-hole vs 18-hole rounds on the same key would be mixed.
- Layout difficulty in the prequential MAE is fitted on all data (leak); holdout fixes this but sample is small.
