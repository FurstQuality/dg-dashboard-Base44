-- 1. course_sources
CREATE TABLE public.course_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('pdga','dgs','udisc')),
  external_id text,
  canonical_url text,
  matched_name text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence integer NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  last_fetched_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX course_sources_course_source_uidx ON public.course_sources (course_id, source);
CREATE UNIQUE INDEX course_sources_source_external_uidx ON public.course_sources (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX course_sources_source_idx ON public.course_sources (source);

GRANT SELECT ON public.course_sources TO authenticated;
GRANT ALL ON public.course_sources TO service_role;

ALTER TABLE public.course_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_sources_read_authenticated"
  ON public.course_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_course_sources_updated_at
  BEFORE UPDATE ON public.course_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. course_layout_profiles
CREATE TABLE public.course_layout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('pdga','dgs','udisc','manual')),
  layout_name text NOT NULL,
  holes integer,
  par integer,
  length_ft integer,
  difficulty text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX course_layout_profiles_uidx
  ON public.course_layout_profiles (course_id, source, layout_name);
CREATE INDEX course_layout_profiles_course_idx ON public.course_layout_profiles (course_id);

GRANT SELECT ON public.course_layout_profiles TO authenticated;
GRANT ALL ON public.course_layout_profiles TO service_role;

ALTER TABLE public.course_layout_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_layout_profiles_read_authenticated"
  ON public.course_layout_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_course_layout_profiles_updated_at
  BEFORE UPDATE ON public.course_layout_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. course_ingest_jobs
CREATE TABLE public.course_ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  target_source text NOT NULL CHECK (target_source IN ('pdga','dgs','udisc','all')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','ok','not_found','error')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finished_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_ingest_jobs_next_run_idx
  ON public.course_ingest_jobs (next_run_at)
  WHERE status IN ('pending','error');
CREATE INDEX course_ingest_jobs_course_idx ON public.course_ingest_jobs (course_id);

GRANT SELECT ON public.course_ingest_jobs TO authenticated;
GRANT ALL ON public.course_ingest_jobs TO service_role;

ALTER TABLE public.course_ingest_jobs ENABLE ROW LEVEL SECURITY;

-- Only the requester or an admin can see the raw job (contains last_error).
CREATE POLICY "course_ingest_jobs_read_own_or_admin"
  ON public.course_ingest_jobs FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER trg_course_ingest_jobs_updated_at
  BEFORE UPDATE ON public.course_ingest_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Extend course_rating_profiles to distinguish auto vs manual submissions.
ALTER TABLE public.course_rating_profiles
  ADD COLUMN IF NOT EXISTS auto_populated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_mix jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence integer;
