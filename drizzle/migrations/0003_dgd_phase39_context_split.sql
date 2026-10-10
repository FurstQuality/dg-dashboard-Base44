ALTER TABLE public.dgd_event_round_difficulty
  ADD COLUMN IF NOT EXISTS baseline_layout_difficulty numeric,
  ADD COLUMN IF NOT EXISTS event_round_adjustment numeric,
  ADD COLUMN IF NOT EXISTS contextual_layout_difficulty numeric,
  ADD COLUMN IF NOT EXISTS adjustment_uncertainty numeric;
COMMENT ON COLUMN public.dgd_event_round_difficulty.event_round_adjustment IS 'Phase 3.9: temporary post-round adjustment (contextual minus baseline). Never written into persistent layout difficulty.';

ALTER TABLE public.rating_model_versions
  ADD COLUMN IF NOT EXISTS shadow_stage text;
ALTER TABLE public.rating_model_versions
  ADD CONSTRAINT rating_model_versions_shadow_stage_check
  CHECK (shadow_stage IS NULL OR shadow_stage IN ('baseline','control','candidate','shadow_champion','rejected'));
COMMENT ON COLUMN public.rating_model_versions.shadow_stage IS 'Internal validation stage. Independent of status; shadow_champion is still hidden from players.';