-- Phase 5C: PDGA source intelligence (admin-only provenance store).
CREATE TABLE public.pdga_src_fetches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL,
  parser_version text NOT NULL,
  http_status int,
  ok boolean NOT NULL,
  error text,
  attempts int NOT NULL DEFAULT 1,
  retrieved_at timestamptz NOT NULL
);
CREATE INDEX ON public.pdga_src_fetches (pdga_number, retrieved_at DESC);

CREATE TABLE public.pdga_src_player_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL,
  data jsonb NOT NULL,
  data_hash text NOT NULL,
  source_url text NOT NULL,
  parser_version text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  superseded_at timestamptz
);
CREATE INDEX ON public.pdga_src_player_snapshots (pdga_number) WHERE superseded_at IS NULL;

CREATE TABLE public.pdga_src_rating_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL,
  effective_date date NOT NULL,
  rating int NOT NULL,
  rounds_used int,
  source_url text NOT NULL,
  parser_version text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  superseded_at timestamptz
);
CREATE UNIQUE INDEX pdga_src_rating_history_active ON public.pdga_src_rating_history (pdga_number, effective_date) WHERE superseded_at IS NULL;

CREATE TABLE public.pdga_src_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL,
  round_key text NOT NULL,
  pdga_event_id text,
  data jsonb NOT NULL,
  data_hash text NOT NULL,
  played_on date NOT NULL,
  round_rating int,
  official_rating_at_round_date int,
  rating_delta int,
  layout_state text NOT NULL,
  quality text NOT NULL,
  source_url text NOT NULL,
  parser_version text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  superseded_at timestamptz
);
CREATE UNIQUE INDEX pdga_src_rounds_active ON public.pdga_src_rounds (pdga_number, round_key) WHERE superseded_at IS NULL;
CREATE INDEX ON public.pdga_src_rounds (pdga_event_id);

CREATE TABLE public.pdga_src_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  data jsonb NOT NULL,
  data_hash text NOT NULL,
  results_official boolean NOT NULL,
  field_rows int NOT NULL DEFAULT 0,
  source_url text NOT NULL,
  parser_version text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  superseded_at timestamptz
);
CREATE UNIQUE INDEX pdga_src_events_active ON public.pdga_src_events (event_id) WHERE superseded_at IS NULL;

CREATE TABLE public.pdga_src_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdga_number text NOT NULL,
  round_key text NOT NULL,
  field text NOT NULL,
  detail_value text,
  event_value text,
  detail_url text,
  event_url text,
  status text NOT NULL DEFAULT 'OPEN',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pdga_number, round_key, field, detail_value, event_value)
);

CREATE TABLE public.pdga_src_sync_state (
  target text PRIMARY KEY,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  source_changed_at timestamptz,
  status text NOT NULL DEFAULT 'NEVER',
  error text,
  retry_count int NOT NULL DEFAULT 0,
  next_due_at timestamptz
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pdga_src_fetches','pdga_src_player_snapshots','pdga_src_rating_history','pdga_src_rounds','pdga_src_events','pdga_src_conflicts','pdga_src_sync_state'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Platform admins read" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()))', t);
  END LOOP;
END $$;

-- Applies one collected payload. Diff-only: identical observations only bump
-- last_seen_at; a changed observation supersedes the old row and inserts a new one.
CREATE OR REPLACE FUNCTION public.pdga_src_apply(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  num text := p->>'pdga_number';
  base text := 'https://www.pdga.com/player/' || (p->>'pdga_number');
  now_ts timestamptz := now();
  x jsonb; h text; cur record; c jsonb;
  n_new int := 0; n_same int := 0; n_superseded int := 0;
  ok_all boolean := true;
BEGIN
  IF num IS NULL OR num !~ '^\d+$' THEN RAISE EXCEPTION 'invalid pdga number'; END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'fetches','[]')) LOOP
    INSERT INTO pdga_src_fetches (pdga_number,url,kind,parser_version,http_status,ok,error,attempts,retrieved_at)
    VALUES (num, x->>'url', x->>'kind', x->>'parser_version', (x->>'status')::int, (x->>'ok')::boolean, x->>'error', coalesce((x->>'attempts')::int,1), (x->>'retrieved_at')::timestamptz);
    IF NOT (x->>'ok')::boolean THEN ok_all := false; END IF;
  END LOOP;

  IF p->'summary' IS NOT NULL AND jsonb_typeof(p->'summary') = 'object' THEN
    h := md5((p->'summary')::text);
    SELECT * INTO cur FROM pdga_src_player_snapshots WHERE pdga_number = num AND superseded_at IS NULL;
    IF cur.id IS NOT NULL AND cur.data_hash = h THEN
      UPDATE pdga_src_player_snapshots SET last_seen_at = now_ts WHERE id = cur.id; n_same := n_same + 1;
    ELSE
      IF cur.id IS NOT NULL THEN UPDATE pdga_src_player_snapshots SET superseded_at = now_ts WHERE id = cur.id; n_superseded := n_superseded + 1; END IF;
      INSERT INTO pdga_src_player_snapshots (pdga_number,data,data_hash,source_url,parser_version,retrieved_at,last_seen_at)
      VALUES (num, p->'summary', h, base, 'pdga-player-parser-v2', now_ts, now_ts); n_new := n_new + 1;
    END IF;
  END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'history','[]')) LOOP
    SELECT * INTO cur FROM pdga_src_rating_history WHERE pdga_number = num AND effective_date = (x->>'effective_date')::date AND superseded_at IS NULL;
    IF cur.id IS NOT NULL AND cur.rating = (x->>'rating')::int AND cur.rounds_used IS NOT DISTINCT FROM (x->>'rounds_used')::int THEN
      UPDATE pdga_src_rating_history SET last_seen_at = now_ts WHERE id = cur.id; n_same := n_same + 1;
    ELSE
      IF cur.id IS NOT NULL THEN UPDATE pdga_src_rating_history SET superseded_at = now_ts WHERE id = cur.id; n_superseded := n_superseded + 1; END IF;
      INSERT INTO pdga_src_rating_history (pdga_number,effective_date,rating,rounds_used,source_url,parser_version,retrieved_at,last_seen_at)
      VALUES (num, (x->>'effective_date')::date, (x->>'rating')::int, (x->>'rounds_used')::int, base || '/history', 'pdga-history-parser-v2', now_ts, now_ts); n_new := n_new + 1;
    END IF;
  END LOOP;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'events','[]')) LOOP
    h := md5(x::text);
    SELECT * INTO cur FROM pdga_src_events WHERE event_id = x->>'event_id' AND superseded_at IS NULL;
    IF cur.id IS NOT NULL AND cur.data_hash = h THEN
      UPDATE pdga_src_events SET last_seen_at = now_ts WHERE id = cur.id; n_same := n_same + 1;
    ELSE
      IF cur.id IS NOT NULL THEN UPDATE pdga_src_events SET superseded_at = now_ts WHERE id = cur.id; n_superseded := n_superseded + 1; END IF;
      INSERT INTO pdga_src_events (event_id,data,data_hash,results_official,field_rows,source_url,parser_version,retrieved_at,last_seen_at)
      VALUES (x->>'event_id', x, h, coalesce((x->>'results_official')::boolean,false), jsonb_array_length(coalesce(x->'field','[]')),
              'https://www.pdga.com/tour/event/' || (x->>'event_id'), 'pdga-event-parser-v2', now_ts, now_ts); n_new := n_new + 1;
    END IF;
  END LOOP;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p->'rounds','[]')) LOOP
    h := md5(x::text);
    SELECT * INTO cur FROM pdga_src_rounds WHERE pdga_number = num AND round_key = x->>'dedupe_key' AND superseded_at IS NULL;
    IF cur.id IS NOT NULL AND cur.data_hash = h THEN
      UPDATE pdga_src_rounds SET last_seen_at = now_ts WHERE id = cur.id; n_same := n_same + 1;
    ELSE
      IF cur.id IS NOT NULL THEN UPDATE pdga_src_rounds SET superseded_at = now_ts WHERE id = cur.id; n_superseded := n_superseded + 1; END IF;
      INSERT INTO pdga_src_rounds (pdga_number,round_key,pdga_event_id,data,data_hash,played_on,round_rating,official_rating_at_round_date,rating_delta,layout_state,quality,source_url,parser_version,retrieved_at,last_seen_at)
      VALUES (num, x->>'dedupe_key', x->>'pdga_event_id', x, h, (x->>'played_on')::date, (x->>'round_rating')::int,
              (x->>'official_rating_at_round_date')::int, (x->>'rating_delta')::int, x->>'layout_state', x->>'quality',
              base || '/details', 'pdga-details-parser-v2', now_ts, now_ts); n_new := n_new + 1;
    END IF;
    FOR c IN SELECT * FROM jsonb_array_elements(coalesce(x->'conflicts','[]')) LOOP
      INSERT INTO pdga_src_conflicts (pdga_number,round_key,field,detail_value,event_value,detail_url,event_url)
      VALUES (num, x->>'dedupe_key', c->>'field', c->>'detail_value', c->>'event_value', base || '/details',
              'https://www.pdga.com/tour/event/' || coalesce(x->>'pdga_event_id',''))
      ON CONFLICT (pdga_number, round_key, field, detail_value, event_value) DO UPDATE SET last_seen_at = now_ts;
    END LOOP;
  END LOOP;

  INSERT INTO pdga_src_sync_state (target,last_checked_at,last_success_at,source_changed_at,status,error,retry_count,next_due_at)
  VALUES ('player:' || num, now_ts, CASE WHEN ok_all THEN now_ts END, CASE WHEN n_new + n_superseded > 0 THEN now_ts END,
          CASE WHEN ok_all THEN 'OK' ELSE 'PARTIAL' END, CASE WHEN ok_all THEN NULL ELSE 'some pages could not be read' END,
          CASE WHEN ok_all THEN 0 ELSE 1 END, now_ts + interval '1 day')
  ON CONFLICT (target) DO UPDATE SET
    last_checked_at = EXCLUDED.last_checked_at,
    last_success_at = coalesce(EXCLUDED.last_success_at, pdga_src_sync_state.last_success_at),
    source_changed_at = coalesce(EXCLUDED.source_changed_at, pdga_src_sync_state.source_changed_at),
    status = EXCLUDED.status, error = EXCLUDED.error,
    retry_count = CASE WHEN ok_all THEN 0 ELSE pdga_src_sync_state.retry_count + 1 END,
    next_due_at = EXCLUDED.next_due_at;

  RETURN jsonb_build_object('new', n_new, 'unchanged', n_same, 'superseded', n_superseded, 'all_pages_ok', ok_all);
END $$;

REVOKE ALL ON FUNCTION public.pdga_src_apply(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdga_src_apply(jsonb) TO service_role;