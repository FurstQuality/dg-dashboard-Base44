-- Full disc specification library
ALTER TABLE public.disc_molds
  ALTER COLUMN speed DROP NOT NULL,
  ALTER COLUMN glide DROP NOT NULL,
  ALTER COLUMN turn DROP NOT NULL,
  ALTER COLUMN fade DROP NOT NULL,
  ALTER COLUMN stability DROP NOT NULL,
  ALTER COLUMN category SET DEFAULT 'specialty'::disc_category,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS link_url text,
  ADD COLUMN IF NOT EXISTS pdga_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdga_approved_on date,
  ADD COLUMN IF NOT EXISTS pdga_class text,
  ADD COLUMN IF NOT EXISTS max_weight_g numeric(5,1),
  ADD COLUMN IF NOT EXISTS diameter_cm numeric(4,1),
  ADD COLUMN IF NOT EXISTS height_cm numeric(4,1),
  ADD COLUMN IF NOT EXISTS rim_depth_cm numeric(4,1),
  ADD COLUMN IF NOT EXISTS inside_rim_diameter_cm numeric(4,1),
  ADD COLUMN IF NOT EXISTS rim_width_cm numeric(4,1),
  ADD COLUMN IF NOT EXISTS rim_depth_ratio numeric(5,2),
  ADD COLUMN IF NOT EXISTS flexibility_kg numeric(6,2),
  ADD COLUMN IF NOT EXISTS last_production_year integer,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'seed',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS disc_molds_name_lower_idx ON public.disc_molds (lower(name));
CREATE INDEX IF NOT EXISTS disc_molds_speed_idx ON public.disc_molds (speed);

DROP TRIGGER IF EXISTS disc_molds_updated ON public.disc_molds;
CREATE TRIGGER disc_molds_updated BEFORE UPDATE ON public.disc_molds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Personal bag details
ALTER TABLE public.user_discs
  ADD COLUMN IF NOT EXISTS plastic_name text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS distance_ft integer;

GRANT SELECT ON public.disc_molds TO anon, authenticated;
GRANT ALL ON public.disc_molds TO service_role;
GRANT SELECT ON public.disc_manufacturers TO anon, authenticated;
GRANT ALL ON public.disc_manufacturers TO service_role;