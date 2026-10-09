
-- 1. avatar_library_presets
CREATE TABLE public.avatar_library_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  source text NOT NULL CHECK (source IN ('avaturn','makehuman','user_promoted')),
  thumbnail_url text,
  glb_url text NOT NULL,
  morphs jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_official boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  avg_rating numeric(4,2),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.avatar_library_presets TO authenticated;
GRANT ALL ON public.avatar_library_presets TO service_role;

ALTER TABLE public.avatar_library_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view presets"
  ON public.avatar_library_presets FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admins can insert presets"
  ON public.avatar_library_presets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update presets"
  ON public.avatar_library_presets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete presets"
  ON public.avatar_library_presets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_avatar_library_presets_updated_at
  BEFORE UPDATE ON public.avatar_library_presets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_avatar_library_presets_source ON public.avatar_library_presets(source);
CREATE INDEX idx_avatar_library_presets_popular ON public.avatar_library_presets(usage_count DESC);
CREATE INDEX idx_avatar_library_presets_tags ON public.avatar_library_presets USING gin(tags);

-- 2. avatar_library_uses
CREATE TABLE public.avatar_library_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.avatar_library_presets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.avatar_library_uses TO authenticated;
GRANT ALL ON public.avatar_library_uses TO service_role;

ALTER TABLE public.avatar_library_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own uses"
  ON public.avatar_library_uses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can record their own uses"
  ON public.avatar_library_uses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_avatar_library_uses_preset ON public.avatar_library_uses(preset_id);

-- Trigger: bump usage_count on insert
CREATE OR REPLACE FUNCTION public.bump_preset_usage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.avatar_library_presets
     SET usage_count = usage_count + 1
   WHERE id = NEW.preset_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_preset_usage() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_bump_preset_usage
  AFTER INSERT ON public.avatar_library_uses
  FOR EACH ROW EXECUTE FUNCTION public.bump_preset_usage();

-- 3. Extend avatar_configs
ALTER TABLE public.avatar_configs
  ADD COLUMN IF NOT EXISTS builder_morphs jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS builder_glb_url text,
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IN ('avaturn','builder','imported','rpm')),
  ADD COLUMN IF NOT EXISTS library_preset_id uuid
    REFERENCES public.avatar_library_presets(id) ON DELETE SET NULL;
