
-- Registry of rows seeded by the mock-data feature so unseeding is precise.
CREATE TABLE public.mock_seed_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id text NOT NULL,
  batch text NOT NULL DEFAULT 'chainlink_sandbox',
  seeded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seeded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, row_id)
);
CREATE INDEX mock_seed_registry_batch_idx ON public.mock_seed_registry (batch, table_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_seed_registry TO authenticated;
GRANT ALL ON public.mock_seed_registry TO service_role;

ALTER TABLE public.mock_seed_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage seed registry"
  ON public.mock_seed_registry
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Singleton settings row for admin-only feature flags. id is boolean = true.
CREATE TABLE public.admin_settings (
  id boolean PRIMARY KEY DEFAULT true,
  mock_data_enabled boolean NOT NULL DEFAULT false,
  sandbox_user_id uuid,
  sandbox_email text,
  sandbox_password_hint text,
  last_seeded_at timestamptz,
  last_activity_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_singleton CHECK (id = true)
);

INSERT INTO public.admin_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.admin_settings TO authenticated;
GRANT ALL ON public.admin_settings TO service_role;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin_settings"
  ON public.admin_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins update admin_settings"
  ON public.admin_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_admin_settings_updated
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
