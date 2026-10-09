CREATE TABLE public.play_availability (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_looking' CHECK (status IN ('looking','maybe','not_looking')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_availability TO authenticated;
GRANT ALL ON public.play_availability TO service_role;
ALTER TABLE public.play_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own or friends availability" ON public.play_availability
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.are_friends(auth.uid(), user_id));
CREATE POLICY "Players manage own availability" ON public.play_availability
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.play_intents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  course_names text[] NOT NULL DEFAULT '{}',
  city text,
  state text,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  holes integer,
  note text,
  visibility text NOT NULL DEFAULT 'friends' CHECK (visibility IN ('friends','public')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX play_intents_window_idx ON public.play_intents (window_end);
CREATE INDEX play_intents_user_idx ON public.play_intents (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_intents TO authenticated;
GRANT ALL ON public.play_intents TO service_role;
ALTER TABLE public.play_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Visible open rounds" ON public.play_intents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR visibility = 'public'
    OR public.are_friends(auth.uid(), user_id)
  );
CREATE POLICY "Players manage own open rounds" ON public.play_intents
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.play_intent_joins (
  intent_id uuid NOT NULL REFERENCES public.play_intents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'in' CHECK (state IN ('in','maybe')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_intent_joins TO authenticated;
GRANT ALL ON public.play_intent_joins TO service_role;
ALTER TABLE public.play_intent_joins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read joins on visible rounds" ON public.play_intent_joins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.play_intents i
      WHERE i.id = intent_id
        AND (i.user_id = auth.uid() OR i.visibility = 'public' OR public.are_friends(auth.uid(), i.user_id))
    )
  );
CREATE POLICY "Players manage own joins" ON public.play_intent_joins
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER play_availability_updated_at BEFORE UPDATE ON public.play_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER play_intents_updated_at BEFORE UPDATE ON public.play_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();