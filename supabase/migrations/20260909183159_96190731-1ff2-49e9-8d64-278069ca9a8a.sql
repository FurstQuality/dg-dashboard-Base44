-- lovable-cron-fallback-reviewed: 288 runs/day; geocoding backlog catch-up for scraped events, no webhook available from the source sites
SELECT cron.schedule('event-location-backfill', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5.lovable.app/api/public/sync/geo-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);