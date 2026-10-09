CREATE TABLE public.tracked_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tracked_courses_user_course_idx ON public.tracked_courses (user_id, course_id) WHERE course_id IS NOT NULL;
CREATE UNIQUE INDEX tracked_courses_user_name_idx ON public.tracked_courses (user_id, lower(course_name)) WHERE course_id IS NULL;
CREATE INDEX tracked_courses_user_idx ON public.tracked_courses (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_courses TO authenticated;
GRANT ALL ON public.tracked_courses TO service_role;

ALTER TABLE public.tracked_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage their own tracked courses" ON public.tracked_courses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
