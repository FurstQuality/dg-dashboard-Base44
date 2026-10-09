DO $$
DECLARE t text;
BEGIN
  SELECT tgname INTO t FROM pg_trigger
  WHERE tgrelid = 'public.courses'::regclass
    AND tgfoid = 'public.enforce_course_moderation'::regproc
  LIMIT 1;
  IF t IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.courses DISABLE TRIGGER %I', t);
  END IF;

  UPDATE public.courses
  SET moderation_status = 'approved', reviewed_at = now()
  WHERE source = 'osm' AND moderation_status = 'pending';

  IF t IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.courses ENABLE TRIGGER %I', t);
  END IF;
END $$;