-- lovable-cron-fallback-reviewed: 288 runs/day; outside sites (PDGA, UDisc, Disc Golf Scene) offer no webhooks, so periodic polling is the only way to keep events/courses/players current; user explicitly asked for continuous automatic ingestion.
SELECT cron.unschedule('outside-data-ingest');
SELECT cron.unschedule('event-location-backfill');
SELECT cron.unschedule('ace-knowledge-ingest');

SELECT cron.schedule('outside-data-ingest', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5-dev.lovable.app/api/public/sync/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

SELECT cron.schedule('event-location-backfill', '*/5 * * * *', $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5-dev.lovable.app/api/public/sync/geo-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

SELECT cron.schedule('ace-knowledge-ingest', '23 */2 * * *', $$
  SELECT net.http_post(
    url := 'https://project--51ec5e38-895e-487c-9ba7-99b8352b4eb5-dev.lovable.app/api/public/sync/ace-knowledge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-live-sync-secret', (SELECT token FROM public.live_sync_tokens WHERE label = 'pg_cron' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

UPDATE public.ingest_state
SET batch_size = 40,
    daily_page_budget = 6000,
    paused = false,
    pause_reason = NULL,
    lease_until = NULL,
    lease_owner = NULL
WHERE id = 'singleton';

UPDATE public.ingest_queue
SET status = 'pending', attempts = 0, last_error = NULL, next_run_at = now()
WHERE status IN ('dead', 'running');