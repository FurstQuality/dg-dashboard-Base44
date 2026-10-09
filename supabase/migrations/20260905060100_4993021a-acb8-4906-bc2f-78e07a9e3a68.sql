CREATE TABLE public.live_event_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_ref text NOT NULL,
  tourn_id text,
  pdga_number text NOT NULL,
  player_name text,
  division text,
  round_number integer NOT NULL DEFAULT 1,
  place integer,
  running_place integer,
  round_score integer,
  round_to_par integer,
  total integer,
  to_par integer,
  thru integer NOT NULL DEFAULT 0,
  hole_scores integer[],
  hole_pars integer[],
  hole_lengths integer[],
  hole_length_units text,
  pool text,
  card_number text,
  tee_time text,
  completed boolean NOT NULL DEFAULT false,
  round_started boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  last_synced_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (event_ref, pdga_number, round_number)
);

CREATE INDEX live_event_scores_event_idx ON public.live_event_scores (event_ref, round_number DESC);
CREATE INDEX live_event_scores_pdga_idx ON public.live_event_scores (pdga_number, last_synced_at DESC);

GRANT SELECT ON public.live_event_scores TO authenticated;
GRANT ALL ON public.live_event_scores TO service_role;

ALTER TABLE public.live_event_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in players can read live scores"
  ON public.live_event_scores FOR SELECT TO authenticated USING (true);

CREATE TABLE public.live_sync_registry (
  event_ref text NOT NULL PRIMARY KEY,
  tourn_id text,
  name text,
  location text,
  start_date date,
  end_date date,
  source text NOT NULL DEFAULT 'pdga',
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamp with time zone,
  last_field_synced_at timestamp with time zone,
  last_status text,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX live_sync_registry_due_idx ON public.live_sync_registry (active, end_date, last_synced_at);

GRANT SELECT, INSERT, UPDATE ON public.live_sync_registry TO authenticated;
GRANT ALL ON public.live_sync_registry TO service_role;

ALTER TABLE public.live_sync_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in players can read the live sync schedule"
  ON public.live_sync_registry FOR SELECT TO authenticated USING (true);

CREATE POLICY "Signed-in players can register events for live sync"
  ON public.live_sync_registry FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Signed-in players can refresh registry metadata"
  ON public.live_sync_registry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_live_event_scores_updated_at
  BEFORE UPDATE ON public.live_event_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_live_sync_registry_updated_at
  BEFORE UPDATE ON public.live_sync_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.friends_live_rounds(_user_id uuid)
RETURNS TABLE (
  round_id uuid,
  player_id uuid,
  display_name text,
  username text,
  avatar_url text,
  course_name text,
  started_at timestamp with time zone,
  holes_played integer,
  total_strokes integer,
  total_par integer,
  last_score_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = _user_id THEN f.addressee_id ELSE f.requester_id END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = _user_id OR f.addressee_id = _user_id)
  )
  SELECT
    r.id AS round_id,
    rp.user_id AS player_id,
    p.display_name,
    p.username,
    p.avatar_url,
    c.name AS course_name,
    r.started_at,
    COALESCE(agg.holes_played, 0)::integer AS holes_played,
    COALESCE(agg.total_strokes, 0)::integer AS total_strokes,
    COALESCE(agg.total_par, 0)::integer AS total_par,
    agg.last_score_at
  FROM public.rounds r
  JOIN public.round_players rp ON rp.round_id = r.id
  JOIN friends fr ON fr.friend_id = rp.user_id
  JOIN public.profiles p ON p.id = rp.user_id
  LEFT JOIN public.courses c ON c.id = r.course_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE s.strokes > 0) AS holes_played,
      COALESCE(SUM(s.strokes), 0) AS total_strokes,
      COALESCE(SUM(h.par) FILTER (WHERE s.strokes > 0), 0) AS total_par,
      MAX(s.updated_at) AS last_score_at
    FROM public.round_scores s
    LEFT JOIN public.holes h ON h.layout_id = r.layout_id AND h.number = s.hole_number
    WHERE s.round_id = r.id AND s.round_player_id = rp.id
  ) agg ON true
  WHERE r.status = 'in_progress'
    AND r.started_at > now() - interval '12 hours'
  ORDER BY agg.last_score_at DESC NULLS LAST, r.started_at DESC;
$$;

REVOKE ALL ON FUNCTION public.friends_live_rounds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friends_live_rounds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_live_rounds(uuid) TO service_role;