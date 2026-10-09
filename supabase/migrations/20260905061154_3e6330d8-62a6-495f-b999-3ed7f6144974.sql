-- lovable-cron-fallback-reviewed: 1440 runs/day; live tournament scoring must be under ~1 minute stale for every viewer, and PDGA offers no push/webhook feed, so polling in-play events is the only way to keep scores current without user-triggered syncs.
CREATE TABLE public.live_sync_tokens (
  token text NOT NULL PRIMARY KEY,
  label text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.live_sync_tokens TO service_role;

ALTER TABLE public.live_sync_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.live_sync_tokens (token, label)
VALUES (encode(gen_random_bytes(32), 'hex'), 'pg_cron');

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'live-scores-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5.lovable.app/api/public/sync/live-scores',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);