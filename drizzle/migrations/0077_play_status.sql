CREATE TABLE public.play_status (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  note text CHECK (char_length(note) <= 140),
  available_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_until <= created_at + interval '12 hours')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_status TO authenticated;
GRANT ALL ON public.play_status TO service_role;
ALTER TABLE public.play_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own status" ON public.play_status FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "friends see status" ON public.play_status FOR SELECT TO authenticated
  USING (available_until > now() AND public.are_friends(auth.uid(), user_id));
CREATE INDEX play_status_until_idx ON public.play_status (available_until);