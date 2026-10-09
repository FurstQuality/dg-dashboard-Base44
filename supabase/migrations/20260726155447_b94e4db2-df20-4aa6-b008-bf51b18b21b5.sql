
CREATE TABLE public.course_rating_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NULL REFERENCES public.courses(id) ON DELETE SET NULL,
  course_name text NOT NULL,
  pdga_course_ref text NULL,
  pdga_course_name text NULL,
  pdga_course_url text NULL,
  ssa numeric NOT NULL,
  stroke_value numeric NOT NULL,
  par_total integer NULL,
  sample_size integer NOT NULL DEFAULT 0,
  event_refs text[] NOT NULL DEFAULT '{}',
  round_summaries jsonb NOT NULL DEFAULT '[]'::jsonb,
  rated_rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_course jsonb NULL,
  notes text NULL,
  status public.moderation_status NOT NULL DEFAULT 'pending',
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  rejection_reason text NULL,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_rating_profiles TO authenticated;
GRANT ALL ON public.course_rating_profiles TO service_role;

ALTER TABLE public.course_rating_profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see approved profiles (the "official" rating profile per course)
CREATE POLICY "Approved profiles are readable"
  ON public.course_rating_profiles FOR SELECT
  TO authenticated
  USING (status = 'approved');

-- Users can see their own submissions in any status
CREATE POLICY "Users can see own submissions"
  ON public.course_rating_profiles FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid());

-- Super admins can see everything
CREATE POLICY "Super admins see all rating profiles"
  ON public.course_rating_profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Authenticated users can submit new profiles for review
CREATE POLICY "Users can submit rating profiles"
  ON public.course_rating_profiles FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending');

-- Users can update their own submissions ONLY while still pending, and cannot change status
CREATE POLICY "Users can edit own pending submissions"
  ON public.course_rating_profiles FOR UPDATE
  TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending')
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending');

-- Super admins can update any profile (approve/reject/lock)
CREATE POLICY "Super admins manage rating profiles"
  ON public.course_rating_profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Super admins can delete
CREATE POLICY "Super admins delete rating profiles"
  ON public.course_rating_profiles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Only ONE approved profile per course_id
CREATE UNIQUE INDEX course_rating_profiles_one_approved_per_course
  ON public.course_rating_profiles (course_id)
  WHERE status = 'approved' AND course_id IS NOT NULL;

-- Prevent duplicate pending submissions from the same user for the same course
CREATE UNIQUE INDEX course_rating_profiles_one_pending_per_user_course
  ON public.course_rating_profiles (submitted_by, course_id)
  WHERE status = 'pending' AND course_id IS NOT NULL;

CREATE INDEX course_rating_profiles_status_idx ON public.course_rating_profiles (status);
CREATE INDEX course_rating_profiles_course_idx ON public.course_rating_profiles (course_id);
CREATE INDEX course_rating_profiles_pdga_ref_idx ON public.course_rating_profiles (pdga_course_ref);

CREATE TRIGGER course_rating_profiles_set_updated_at
  BEFORE UPDATE ON public.course_rating_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
