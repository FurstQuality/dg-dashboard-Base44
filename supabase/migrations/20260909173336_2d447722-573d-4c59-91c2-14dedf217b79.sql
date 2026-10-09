CREATE TABLE public.ace_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  region TEXT,
  state TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL UNIQUE,
  quality INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig,
      coalesce(title, '') || ' ' || coalesce(body, '') || ' ' ||
      coalesce(region, '') || ' ' || coalesce(state, ''))
  ) STORED
);

CREATE INDEX ace_knowledge_search_idx ON public.ace_knowledge USING GIN (search);
CREATE INDEX ace_knowledge_state_idx ON public.ace_knowledge (state);
CREATE INDEX ace_knowledge_kind_idx ON public.ace_knowledge (kind);

GRANT SELECT ON public.ace_knowledge TO authenticated;
GRANT ALL ON public.ace_knowledge TO service_role;
ALTER TABLE public.ace_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in players can read Ace knowledge"
  ON public.ace_knowledge FOR SELECT TO authenticated USING (true);

CREATE TABLE public.ace_knowledge_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  added INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  note TEXT
);

GRANT SELECT ON public.ace_knowledge_runs TO authenticated;
GRANT ALL ON public.ace_knowledge_runs TO service_role;
ALTER TABLE public.ace_knowledge_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can review knowledge builds"
  ON public.ace_knowledge_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.search_ace_knowledge(
  _query TEXT,
  _state TEXT DEFAULT NULL,
  _limit INT DEFAULT 8
)
RETURNS TABLE (
  kind TEXT,
  title TEXT,
  body TEXT,
  region TEXT,
  state TEXT,
  source TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', coalesce(_query, '')) AS tsq
  )
  SELECT k.kind, k.title, k.body, k.region, k.state, k.source,
         ts_rank(k.search, q.tsq)
           + CASE WHEN _state IS NOT NULL AND k.state = _state THEN 0.5 ELSE 0 END
           + (k.quality::real / 500.0) AS rank
  FROM public.ace_knowledge k, q
  WHERE q.tsq IS NOT NULL
    AND (k.search @@ q.tsq OR (_state IS NOT NULL AND k.state = _state))
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(coalesce(_limit, 8), 1), 40);
$$;

GRANT EXECUTE ON FUNCTION public.search_ace_knowledge(TEXT, TEXT, INT) TO authenticated;