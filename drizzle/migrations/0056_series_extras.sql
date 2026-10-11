ALTER TABLE public.event_series
  ADD COLUMN IF NOT EXISTS finale_multiplier numeric NOT NULL DEFAULT 1 CHECK (finale_multiplier >= 1 AND finale_multiplier <= 5),
  ADD COLUMN IF NOT EXISTS participation_bonus integer NOT NULL DEFAULT 0 CHECK (participation_bonus >= 0 AND participation_bonus <= 100),
  ADD COLUMN IF NOT EXISTS qualify_min_events integer NOT NULL DEFAULT 0 CHECK (qualify_min_events >= 0 AND qualify_min_events <= 60),
  ADD COLUMN IF NOT EXISTS award_places integer NOT NULL DEFAULT 0 CHECK (award_places >= 0 AND award_places <= 50),
  ADD COLUMN IF NOT EXISTS copied_from_id uuid REFERENCES public.event_series(id) ON DELETE SET NULL;