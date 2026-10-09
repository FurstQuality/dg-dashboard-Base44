
CREATE TABLE public.user_theme_prefs (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'dark' CHECK (mode IN ('dark','light')),
  palette JSONB NOT NULL DEFAULT '{"bg":"#0E1E1A","surface":"#1F2124","accent":"#76D64A","highlight":"#F4A63C"}'::jsonb,
  background JSONB NOT NULL DEFAULT '{"kind":"solid","value":""}'::jsonb,
  preset TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_theme_prefs TO authenticated;
GRANT ALL ON public.user_theme_prefs TO service_role;
ALTER TABLE public.user_theme_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own theme prefs" ON public.user_theme_prefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_dashboard_layouts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_layouts TO authenticated;
GRANT ALL ON public.user_dashboard_layouts TO service_role;
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own layouts" ON public.user_dashboard_layouts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_theme_prefs_updated
  BEFORE UPDATE ON public.user_theme_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_dashboard_layouts_updated
  BEFORE UPDATE ON public.user_dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
