CREATE TABLE IF NOT EXISTS public.udisc_catalog (
  slug text PRIMARY KEY,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','queued','imported','matched','skipped','failed')),
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  name text,
  city text,
  state text,
  country text,
  hole_count integer,
  latitude double precision,
  longitude double precision,
  last_error text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS udisc_catalog_status_idx ON public.udisc_catalog (status);
CREATE INDEX IF NOT EXISTS udisc_catalog_state_idx ON public.udisc_catalog (state);
CREATE INDEX IF NOT EXISTS udisc_catalog_course_idx ON public.udisc_catalog (course_id);

GRANT SELECT ON public.udisc_catalog TO authenticated;
GRANT ALL ON public.udisc_catalog TO service_role;

ALTER TABLE public.udisc_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view the UDisc catalog"
  ON public.udisc_catalog FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_udisc_catalog_updated_at
  BEFORE UPDATE ON public.udisc_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();