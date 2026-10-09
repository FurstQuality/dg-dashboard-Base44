ALTER TYPE public.ob_side ADD VALUE IF NOT EXISTS 'past';
ALTER TYPE public.ob_side ADD VALUE IF NOT EXISTS 'behind';
ALTER TABLE public.course_features ADD COLUMN IF NOT EXISTS hole_numbers integer[];