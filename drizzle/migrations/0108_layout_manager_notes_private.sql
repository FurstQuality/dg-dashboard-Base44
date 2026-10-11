CREATE TABLE IF NOT EXISTS public.layout_manager_notes (
  layout_id uuid PRIMARY KEY REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  course_id uuid NOT NULL,
  notes text,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.layout_manager_notes TO authenticated;
GRANT ALL ON public.layout_manager_notes TO service_role;
ALTER TABLE public.layout_manager_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Course managers manage layout notes" ON public.layout_manager_notes FOR ALL TO authenticated
  USING (public.can_steward_course(course_id, auth.uid()))
  WITH CHECK (public.can_steward_course(course_id, auth.uid()) AND EXISTS (SELECT 1 FROM public.course_layouts l WHERE l.id = layout_id AND l.course_id = layout_manager_notes.course_id));
INSERT INTO public.layout_manager_notes (layout_id, course_id, notes)
  SELECT id, course_id, manager_notes FROM public.course_layouts WHERE manager_notes IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE public.course_layouts SET manager_notes = NULL WHERE manager_notes IS NOT NULL;
COMMENT ON COLUMN public.course_layouts.manager_notes IS 'DEPRECATED: replaced by layout_manager_notes (managers-only RLS)';