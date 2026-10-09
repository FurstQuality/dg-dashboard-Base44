
CREATE TYPE public.hole_media_kind AS ENUM ('photo','drone_video','video');

CREATE TABLE public.hole_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id uuid NOT NULL REFERENCES public.holes(id) ON DELETE CASCADE,
  kind public.hole_media_kind NOT NULL DEFAULT 'photo',
  storage_path text NOT NULL,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hole_media TO authenticated;
GRANT SELECT ON public.hole_media TO anon;
GRANT ALL ON public.hole_media TO service_role;

ALTER TABLE public.hole_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hole_media_select_all" ON public.hole_media FOR SELECT USING (true);

CREATE POLICY "hole_media_owner_write" ON public.hole_media FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.holes h
  JOIN public.course_layouts cl ON cl.id = h.layout_id
  JOIN public.courses c ON c.id = cl.course_id
  WHERE h.id = hole_media.hole_id AND c.created_by = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.holes h
  JOIN public.course_layouts cl ON cl.id = h.layout_id
  JOIN public.courses c ON c.id = cl.course_id
  WHERE h.id = hole_media.hole_id AND c.created_by = auth.uid()
));

CREATE INDEX idx_hole_media_hole ON public.hole_media(hole_id, sort_order);

CREATE TRIGGER trg_hole_media_updated BEFORE UPDATE ON public.hole_media
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
