
CREATE TABLE public.course_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  scenery SMALLINT CHECK (scenery BETWEEN 1 AND 5),
  design SMALLINT CHECK (design BETWEEN 1 AND 5),
  upkeep SMALLINT CHECK (upkeep BETWEEN 1 AND 5),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);

GRANT SELECT ON public.course_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_reviews TO authenticated;
GRANT ALL ON public.course_reviews TO service_role;

ALTER TABLE public.course_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are public"
  ON public.course_reviews FOR SELECT USING (true);

CREATE POLICY "Users insert their own reviews"
  ON public.course_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own reviews"
  ON public.course_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own reviews"
  ON public.course_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_course_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_course_reviews_updated_at
  BEFORE UPDATE ON public.course_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_course_reviews_updated_at();

CREATE INDEX idx_course_reviews_course ON public.course_reviews(course_id);
