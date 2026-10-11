CREATE TABLE public.tee_sign_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  hole_id uuid REFERENCES public.holes(id) ON DELETE CASCADE,
  design jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tee_sign_designs IS 'Tee sign artwork per layout. hole_id null = shared design applied to every sign of the layout.';
CREATE UNIQUE INDEX tee_sign_designs_shared ON public.tee_sign_designs(layout_id) WHERE hole_id IS NULL;
CREATE UNIQUE INDEX tee_sign_designs_hole ON public.tee_sign_designs(layout_id, hole_id) WHERE hole_id IS NOT NULL;
GRANT SELECT ON public.tee_sign_designs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tee_sign_designs TO authenticated;
GRANT ALL ON public.tee_sign_designs TO service_role;
ALTER TABLE public.tee_sign_designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tee sign designs are readable" ON public.tee_sign_designs FOR SELECT USING (true);
CREATE POLICY "Layout editors manage tee sign designs" ON public.tee_sign_designs FOR ALL TO authenticated
  USING (public.can_edit_layout(layout_id, auth.uid()))
  WITH CHECK (public.can_edit_layout(layout_id, auth.uid()));

CREATE TABLE public.tee_sign_media (
  storage_path text PRIMARY KEY,
  layout_id uuid NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tee_sign_media TO anon, authenticated;
GRANT INSERT, DELETE ON public.tee_sign_media TO authenticated;
GRANT ALL ON public.tee_sign_media TO service_role;
ALTER TABLE public.tee_sign_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tee sign media is readable" ON public.tee_sign_media FOR SELECT USING (true);
CREATE POLICY "Layout editors add tee sign media" ON public.tee_sign_media FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_edit_layout(layout_id, auth.uid())
    AND split_part(storage_path, '/', 1) = auth.uid()::text);
CREATE POLICY "Uploaders remove tee sign media" ON public.tee_sign_media FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "tee_sign_media_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'hole-media' AND EXISTS (SELECT 1 FROM public.tee_sign_media t WHERE t.storage_path = objects.name));