ALTER TYPE public.course_feature_type ADD VALUE IF NOT EXISTS 'course_boundary';
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS overview_snapshot_path text,
  ADD COLUMN IF NOT EXISTS boundary_locked boolean NOT NULL DEFAULT false;