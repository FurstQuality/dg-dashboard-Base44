UPDATE public.ingest_regions SET active = true WHERE active = false;

UPDATE public.ingest_state
SET batch_size = 24, daily_page_budget = 1800
WHERE id = 'singleton';