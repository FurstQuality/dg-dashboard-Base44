CREATE TABLE IF NOT EXISTS public.app_bottom_nav_default (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  keys text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_bottom_nav_default TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_bottom_nav_default TO authenticated;
GRANT ALL ON public.app_bottom_nav_default TO service_role;

ALTER TABLE public.app_bottom_nav_default ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read the default bottom bar" ON public.app_bottom_nav_default;
CREATE POLICY "Anyone can read the default bottom bar"
  ON public.app_bottom_nav_default FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins set the default bottom bar" ON public.app_bottom_nav_default;
CREATE POLICY "Admins set the default bottom bar"
  ON public.app_bottom_nav_default FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Admins update the default bottom bar" ON public.app_bottom_nav_default;
CREATE POLICY "Admins update the default bottom bar"
  ON public.app_bottom_nav_default FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));