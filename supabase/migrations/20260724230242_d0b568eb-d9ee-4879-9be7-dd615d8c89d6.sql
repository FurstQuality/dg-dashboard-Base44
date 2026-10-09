
CREATE TABLE public.user_dashboard_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dashboard_key text NOT NULL,
  widget_order text[] NOT NULL DEFAULT '{}',
  hidden_widgets text[] NOT NULL DEFAULT '{}',
  widget_sizes jsonb NOT NULL DEFAULT '{}'::jsonb,
  preset text,
  layout_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dashboard_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_prefs TO authenticated;
GRANT ALL ON public.user_dashboard_prefs TO service_role;

ALTER TABLE public.user_dashboard_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own dashboard prefs"
  ON public.user_dashboard_prefs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_dashboard_prefs_updated_at
  BEFORE UPDATE ON public.user_dashboard_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX user_dashboard_prefs_user_key_idx
  ON public.user_dashboard_prefs (user_id, dashboard_key);
