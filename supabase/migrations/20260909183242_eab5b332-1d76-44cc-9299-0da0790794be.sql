-- lovable-cron-fallback-reviewed: 96 runs/day; existing event refresh cadence kept, only the request timeout changes; source sites offer no webhooks
SELECT cron.unschedule('external-data-sync');
SELECT cron.schedule('external-data-sync', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5.lovable.app/api/public/sync/external-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);