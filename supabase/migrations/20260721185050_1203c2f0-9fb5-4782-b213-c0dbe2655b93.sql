
-- Grant super_admin to the account owner
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE email = 'furst93@gmail.com'
ON CONFLICT DO NOTHING;

-- Moderation columns on courses
DO $$ BEGIN
  CREATE TYPE public.moderation_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS moderation_status public.moderation_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

UPDATE public.courses SET moderation_status = 'approved', reviewed_at = now()
WHERE moderation_status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS courses_unique_name_city_state
  ON public.courses (lower(name), lower(coalesce(city, '')), lower(coalesce(state, '')));

CREATE OR REPLACE FUNCTION public.enforce_course_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
      NEW.moderation_status := 'pending';
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.submitted_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
      NEW.moderation_status := OLD.moderation_status;
      NEW.rejection_reason := OLD.rejection_reason;
      NEW.reviewed_by := OLD.reviewed_by;
      NEW.reviewed_at := OLD.reviewed_at;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS courses_moderation_guard ON public.courses;
CREATE TRIGGER courses_moderation_guard
  BEFORE INSERT OR UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_course_moderation();

DROP POLICY IF EXISTS "Courses viewable by everyone" ON public.courses;
DROP POLICY IF EXISTS "Courses viewable when approved or owned" ON public.courses;
DROP POLICY IF EXISTS "Creators can update their courses" ON public.courses;
DROP POLICY IF EXISTS "Creators or admins can update courses" ON public.courses;
DROP POLICY IF EXISTS "Creators can delete their courses" ON public.courses;
DROP POLICY IF EXISTS "Creators or admins can delete courses" ON public.courses;

CREATE POLICY "Courses viewable when approved or owned"
  ON public.courses FOR SELECT
  USING (
    moderation_status = 'approved'
    OR auth.uid() = created_by
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Creators or admins can update courses"
  ON public.courses FOR UPDATE
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Creators or admins can delete courses"
  ON public.courses FOR DELETE
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.course_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  payload jsonb NOT NULL,
  status public.moderation_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_edit_requests TO authenticated;
GRANT ALL ON public.course_edit_requests TO service_role;

ALTER TABLE public.course_edit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters and admins can view edit requests"
  ON public.course_edit_requests FOR SELECT
  USING (auth.uid() = requested_by OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Creators can submit edit requests for their courses"
  ON public.course_edit_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requested_by
    AND EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid())
  );

CREATE POLICY "Admins can update edit requests"
  ON public.course_edit_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Requesters or admins can delete edit requests"
  ON public.course_edit_requests FOR DELETE
  USING (auth.uid() = requested_by OR public.has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS course_edit_requests_updated_at ON public.course_edit_requests;
CREATE TRIGGER course_edit_requests_updated_at
  BEFORE UPDATE ON public.course_edit_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
