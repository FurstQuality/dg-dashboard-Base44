CREATE OR REPLACE FUNCTION public.get_my_data_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'rounds', jsonb_build_object(
      'total',    (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid()),
      'verified', (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid() AND trust_level = 'verified'),
      'scraped',  (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid() AND trust_level = 'scraped'),
      'manual',   (SELECT count(*) FROM public.external_rounds WHERE user_id = auth.uid() AND trust_level = 'manual'),
      'needs_review', (SELECT count(*) FROM public.external_rounds
                        WHERE user_id = auth.uid()
                          AND coalesce(included, true)
                          AND (
                            score IS NULL
                            OR score <= 0
                            OR (source <> 'udisc' AND round_rating IS NULL)
                          ))
    ),
    'events', jsonb_build_object(
      'total',    (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid()),
      'verified', (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid() AND trust_level = 'verified'),
      'scraped',  (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid() AND trust_level = 'scraped'),
      'manual',   (SELECT count(*) FROM public.scheduled_events WHERE user_id = auth.uid() AND trust_level = 'manual'),
      'upcoming', (SELECT count(*) FROM public.scheduled_events
                    WHERE user_id = auth.uid() AND starts_on >= current_date)
    ),
    'generated_at', now()
  );
$$;