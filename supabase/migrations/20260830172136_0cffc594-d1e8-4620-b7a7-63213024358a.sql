ALTER TYPE public.goal_metric ADD VALUE IF NOT EXISTS 'round_rating';
ALTER TYPE public.goal_metric ADD VALUE IF NOT EXISTS 'scoring_average';
ALTER TYPE public.goal_metric ADD VALUE IF NOT EXISTS 'birdie_rate';
ALTER TYPE public.goal_metric ADD VALUE IF NOT EXISTS 'course_pr';

ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS course_name text;
ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS baseline integer;
ALTER TABLE public.user_goals ADD COLUMN IF NOT EXISTS shared_at timestamp with time zone;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goals TO authenticated;
GRANT ALL ON public.user_goals TO service_role;