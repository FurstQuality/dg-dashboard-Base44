ALTER TABLE public.post_reports
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS reviewer_note text;

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'report_resolved';
