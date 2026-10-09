ALTER TABLE public.courses DISABLE TRIGGER USER;

UPDATE public.courses
SET moderation_status = 'approved',
    reviewed_at = now()
WHERE source = 'pdga' AND moderation_status = 'pending';

ALTER TABLE public.courses ENABLE TRIGGER USER;