ALTER TABLE public.external_rounds
  ADD COLUMN IF NOT EXISTS participant_count integer,
  ADD COLUMN IF NOT EXISTS participant_count_source text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS round_format_class text,
  ADD COLUMN IF NOT EXISTS event_context text,
  ADD COLUMN IF NOT EXISTS rating_exclusion_reason text;

ALTER TABLE public.external_rounds
  ADD CONSTRAINT external_rounds_participant_count_source_chk
    CHECK (participant_count_source IN ('SOURCE','CARD_INFERRED','UNKNOWN')),
  ADD CONSTRAINT external_rounds_round_format_class_chk
    CHECK (round_format_class IS NULL OR round_format_class IN ('SINGLES_MULTI_PLAYER','SINGLES_SOLO','DOUBLES','TEAM','UNKNOWN_FORMAT')),
  ADD CONSTRAINT external_rounds_event_context_chk
    CHECK (event_context IS NULL OR event_context IN ('LEAGUE','TOURNAMENT','CASUAL_MULTI_PLAYER','OTHER_MULTI_PLAYER','UNKNOWN_EVENT_TYPE'));

COMMENT ON COLUMN public.external_rounds.round_rating IS 'Source-owned native rating (PDGA or UDisc). Never overwritten by DGD values.';
COMMENT ON COLUMN public.external_rounds.round_format_class IS 'UDisc format audit class. Only SINGLES_MULTI_PLAYER is DGD-rating eligible.';

-- Audit backfill of existing UDisc rows. Player count was never stored, so
-- singles stay UNKNOWN_FORMAT (held out) until a re-import supplies card evidence.
UPDATE public.external_rounds SET
  round_format_class = CASE WHEN format = 'team' THEN 'TEAM' WHEN format = 'doubles' THEN 'DOUBLES' ELSE 'UNKNOWN_FORMAT' END,
  rating_exclusion_reason = CASE WHEN format IN ('team','doubles') THEN 'TEAM_OR_DOUBLES' ELSE 'UNKNOWN_FORMAT' END,
  event_context = 'UNKNOWN_EVENT_TYPE'
WHERE source = 'udisc' AND round_format_class IS NULL;