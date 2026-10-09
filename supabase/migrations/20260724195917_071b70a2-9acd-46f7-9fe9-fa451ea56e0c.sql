-- Ghost Course support: lightweight placeholders auto-created from PDGA data.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_ghost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS courses_ghost_name_key
  ON public.courses (lower(name)) WHERE is_ghost = true;

CREATE INDEX IF NOT EXISTS courses_is_ghost_idx ON public.courses (is_ghost);

-- Signed-in users can read ghost courses even when moderation is not approved,
-- so tracker/course-picker UIs can render them. Existing public/anon SELECT
-- policy (approved-only) is unchanged.
DROP POLICY IF EXISTS "Authenticated can view ghost courses" ON public.courses;
CREATE POLICY "Authenticated can view ghost courses"
  ON public.courses FOR SELECT
  TO authenticated
  USING (is_ghost = true);
