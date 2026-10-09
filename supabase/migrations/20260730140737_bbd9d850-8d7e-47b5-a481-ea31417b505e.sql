CREATE UNIQUE INDEX IF NOT EXISTS courses_source_ref_uidx
  ON public.courses (source, source_ref)
  WHERE source IS NOT NULL AND source_ref IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS courses_name_trgm_idx
  ON public.courses USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS courses_state_idx ON public.courses (state);
CREATE INDEX IF NOT EXISTS courses_city_idx ON public.courses (city);
CREATE INDEX IF NOT EXISTS courses_moderation_idx ON public.courses (moderation_status);