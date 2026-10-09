UPDATE public.udisc_catalog SET status='new', course_id=NULL, fetched_at=NULL WHERE status IN ('imported','matched') AND course_id IN (SELECT id FROM public.courses WHERE enrichment_source='udisc_catalog');
DELETE FROM public.course_sources WHERE course_id IN (SELECT id FROM public.courses WHERE enrichment_source='udisc_catalog');
DELETE FROM public.course_layouts WHERE course_id IN (SELECT id FROM public.courses WHERE enrichment_source='udisc_catalog');
DELETE FROM public.courses WHERE enrichment_source='udisc_catalog';