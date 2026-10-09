UPDATE public.udisc_catalog
SET status = 'new', fetched_at = NULL, last_error = NULL
WHERE status = 'skipped'
  AND state IN (SELECT code FROM (VALUES ('TX'),('OR'),('NM'),('NY')) AS s(code));