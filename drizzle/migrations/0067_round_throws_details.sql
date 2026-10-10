ALTER TABLE public.round_throws
  ADD COLUMN penalty_strokes integer NOT NULL DEFAULT 0 CHECK (penalty_strokes BETWEEN 0 AND 3),
  ADD COLUMN disc_id uuid REFERENCES public.user_discs(id) ON DELETE SET NULL,
  ADD COLUMN throw_style text CHECK (throw_style IN ('backhand','forehand','overhand','roller','putt','other')),
  ADD COLUMN shot_shape text CHECK (shot_shape IN ('hyzer','straight','anhyzer','flex','roller','other')),
  ADD COLUMN miss_direction text CHECK (miss_direction IN ('left','right','short','long','high','low')),
  ADD COLUMN source text NOT NULL DEFAULT 'quick_entry';
ALTER TABLE public.round_scores
  ADD COLUMN throw_tracking text NOT NULL DEFAULT 'none' CHECK (throw_tracking IN ('none','partial','complete'));