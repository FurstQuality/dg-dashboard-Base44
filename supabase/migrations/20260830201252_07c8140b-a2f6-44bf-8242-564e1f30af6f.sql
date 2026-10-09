ALTER TABLE public.course_layouts
  ADD COLUMN IF NOT EXISTS mando_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dropzone_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ob_line_feet integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ob_area_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS water_hole_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS island_green_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_hole_ft integer,
  ADD COLUMN IF NOT EXISTS shortest_hole_ft integer,
  ADD COLUMN IF NOT EXISTS design_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS design_updated_at timestamptz;