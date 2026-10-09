
CREATE TABLE public.course_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_key text NOT NULL,
  display_name text NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  location text,
  notes text,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_book_entries TO authenticated;
GRANT ALL ON public.course_book_entries TO service_role;
ALTER TABLE public.course_book_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entries all" ON public.course_book_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER course_book_entries_updated_at BEFORE UPDATE ON public.course_book_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX course_book_entries_user_idx ON public.course_book_entries(user_id, pinned DESC, updated_at DESC);

CREATE TABLE public.course_book_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.course_book_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo','scorecard')),
  storage_path text NOT NULL,
  caption text,
  taken_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_book_media TO authenticated;
GRANT ALL ON public.course_book_media TO service_role;
ALTER TABLE public.course_book_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own media all" ON public.course_book_media FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX course_book_media_entry_idx ON public.course_book_media(entry_id, created_at DESC);
