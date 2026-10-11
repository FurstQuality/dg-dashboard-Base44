CREATE TABLE public.source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  source_url text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  parser_version text,
  parse_status text NOT NULL DEFAULT 'stored',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, entity_type, external_id, content_hash)
);
CREATE INDEX source_snapshots_entity_idx ON public.source_snapshots (source, entity_type, external_id, retrieved_at DESC);

CREATE TABLE public.field_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  source text NOT NULL,
  value jsonb,
  snapshot_id uuid REFERENCES public.source_snapshots(id) ON DELETE SET NULL,
  parser_version text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  verified boolean NOT NULL DEFAULT false
);
CREATE INDEX field_observations_entity_idx ON public.field_observations (entity_type, entity_id, field) WHERE superseded_at IS NULL;

GRANT ALL ON public.source_snapshots TO service_role;
GRANT ALL ON public.field_observations TO service_role;
GRANT SELECT ON public.source_snapshots TO authenticated;
GRANT SELECT ON public.field_observations TO authenticated;
ALTER TABLE public.source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read snapshots" ON public.source_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins read observations" ON public.field_observations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Snapshots are immutable: no updates to the captured payload or hash.
CREATE OR REPLACE FUNCTION public.source_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payload IS DISTINCT FROM OLD.payload OR NEW.content_hash IS DISTINCT FROM OLD.content_hash THEN
    RAISE EXCEPTION 'Source snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_snapshots_immutable BEFORE UPDATE ON public.source_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.source_snapshot_immutable();

-- New observation of a field supersedes the previous one from the same source, never deletes it.
CREATE OR REPLACE FUNCTION public.field_observation_supersede()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.field_observations SET superseded_at = NEW.observed_at
   WHERE entity_type = NEW.entity_type AND entity_id = NEW.entity_id AND field = NEW.field
     AND source = NEW.source AND superseded_at IS NULL AND id <> NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER field_observations_supersede AFTER INSERT ON public.field_observations
  FOR EACH ROW EXECUTE FUNCTION public.field_observation_supersede();

-- Backfill: keep existing course source payloads as snapshots.
INSERT INTO public.source_snapshots (source, entity_type, external_id, source_url, retrieved_at, content_hash, payload, parse_status)
SELECT source, 'course', external_id, canonical_url, coalesce(last_fetched_at, created_at), md5(raw::text), raw, 'legacy'
FROM public.course_sources WHERE raw IS NOT NULL AND external_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: field provenance for course identity links.
INSERT INTO public.field_observations (entity_type, entity_id, field, source, value, observed_at)
SELECT 'course', course_id::text, source || '_id', source, to_jsonb(external_id), coalesce(last_fetched_at, created_at)
FROM public.course_sources WHERE course_id IS NOT NULL AND external_id IS NOT NULL;