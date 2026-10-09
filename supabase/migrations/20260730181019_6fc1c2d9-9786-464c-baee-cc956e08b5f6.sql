CREATE POLICY "Layout authors manage hole tees"
ON public.hole_tees FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.holes h
    JOIN public.course_layouts cl ON cl.id = h.layout_id
    WHERE h.id = hole_tees.hole_id AND cl.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.holes h
    JOIN public.course_layouts cl ON cl.id = h.layout_id
    WHERE h.id = hole_tees.hole_id AND cl.created_by = auth.uid()
  )
);

CREATE POLICY "Layout authors manage hole baskets"
ON public.hole_baskets FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.holes h
    JOIN public.course_layouts cl ON cl.id = h.layout_id
    WHERE h.id = hole_baskets.hole_id AND cl.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.holes h
    JOIN public.course_layouts cl ON cl.id = h.layout_id
    WHERE h.id = hole_baskets.hole_id AND cl.created_by = auth.uid()
  )
);

CREATE POLICY "Layout authors insert features"
ON public.course_features FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.course_layouts cl
    WHERE cl.id = course_features.layout_id AND cl.created_by = auth.uid()
  )
);

CREATE POLICY "Layout authors update features"
ON public.course_features FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.course_layouts cl
    WHERE cl.id = course_features.layout_id AND cl.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.course_layouts cl
    WHERE cl.id = course_features.layout_id AND cl.created_by = auth.uid()
  )
);

CREATE POLICY "Layout authors delete features"
ON public.course_features FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.course_layouts cl
    WHERE cl.id = course_features.layout_id AND cl.created_by = auth.uid()
  )
);