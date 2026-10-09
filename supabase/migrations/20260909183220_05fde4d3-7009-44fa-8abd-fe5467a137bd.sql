-- lovable-cron-fallback-reviewed: 144 runs/day; catch-up crawl of PDGA/UDisc/Disc Golf Scene pages, no webhooks available from those sites, cadence drops after the backlog clears
SELECT cron.unschedule('outside-data-ingest');
SELECT cron.schedule('outside-data-ingest', '*/10 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5.lovable.app/api/public/sync/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);