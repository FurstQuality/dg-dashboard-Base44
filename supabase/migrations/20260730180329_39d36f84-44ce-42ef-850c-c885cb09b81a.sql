ALTER TABLE public.course_layouts ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE POLICY "Players can add layouts to published courses"
ON public.course_layouts FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_layouts.course_id
      AND c.moderation_status = 'approved'
  )
);

CREATE POLICY "Layout authors update their layouts"
ON public.course_layouts FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Layout authors delete their layouts"
ON public.course_layouts FOR DELETE TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Layout authors manage holes"
ON public.holes FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.course_layouts l
    WHERE l.id = holes.layout_id AND l.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.course_layouts l
    WHERE l.id = holes.layout_id AND l.created_by = auth.uid()
  )
);