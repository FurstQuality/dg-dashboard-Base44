
-- COURSES
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'USA',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  cover_url TEXT,
  hole_count INTEGER NOT NULL DEFAULT 18,
  difficulty TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Courses viewable by everyone" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Auth users can create courses" ON public.courses FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update their courses" ON public.courses FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete their courses" ON public.courses FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.course_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hole_count INTEGER NOT NULL DEFAULT 18,
  par_total INTEGER,
  distance_total INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.course_layouts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_layouts TO authenticated;
GRANT ALL ON public.course_layouts TO service_role;
ALTER TABLE public.course_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Layouts viewable by everyone" ON public.course_layouts FOR SELECT USING (true);
CREATE POLICY "Course creators manage layouts" ON public.course_layouts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.created_by = auth.uid()));
CREATE INDEX idx_layouts_course ON public.course_layouts(course_id);

CREATE TABLE public.holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  par INTEGER NOT NULL DEFAULT 3,
  distance_ft INTEGER,
  tee_lat DOUBLE PRECISION,
  tee_lng DOUBLE PRECISION,
  basket_lat DOUBLE PRECISION,
  basket_lng DOUBLE PRECISION,
  notes TEXT,
  UNIQUE(layout_id, number)
);
GRANT SELECT ON public.holes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holes TO authenticated;
GRANT ALL ON public.holes TO service_role;
ALTER TABLE public.holes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Holes viewable by everyone" ON public.holes FOR SELECT USING (true);
CREATE POLICY "Course creators manage holes" ON public.holes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.course_layouts l JOIN public.courses c ON c.id = l.course_id WHERE l.id = layout_id AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.course_layouts l JOIN public.courses c ON c.id = l.course_id WHERE l.id = layout_id AND c.created_by = auth.uid()));
CREATE INDEX idx_holes_layout ON public.holes(layout_id);

CREATE TYPE public.round_status AS ENUM ('in_progress', 'completed', 'abandoned');

CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  layout_id UUID NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.round_status NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rounds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT ALL ON public.rounds TO service_role;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rounds viewable by everyone" ON public.rounds FOR SELECT USING (true);
CREATE POLICY "Auth users create rounds" ON public.rounds FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators update their rounds" ON public.rounds FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators delete their rounds" ON public.rounds FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_rounds_updated BEFORE UPDATE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_rounds_course ON public.rounds(course_id);
CREATE INDEX idx_rounds_creator ON public.rounds(created_by);

CREATE TABLE public.round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.round_players TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_players TO authenticated;
GRANT ALL ON public.round_players TO service_role;
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Round players viewable by everyone" ON public.round_players FOR SELECT USING (true);
CREATE POLICY "Round creator manages players" ON public.round_players FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid()));
CREATE INDEX idx_round_players_round ON public.round_players(round_id);

CREATE TABLE public.round_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  round_player_id UUID NOT NULL REFERENCES public.round_players(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL,
  strokes INTEGER NOT NULL DEFAULT 0,
  putts INTEGER DEFAULT 0,
  penalties INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_player_id, hole_number)
);
GRANT SELECT ON public.round_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.round_scores TO authenticated;
GRANT ALL ON public.round_scores TO service_role;
ALTER TABLE public.round_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scores viewable by everyone" ON public.round_scores FOR SELECT USING (true);
CREATE POLICY "Round creator manages scores" ON public.round_scores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.created_by = auth.uid()));
CREATE TRIGGER trg_scores_updated BEFORE UPDATE ON public.round_scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_scores_round ON public.round_scores(round_id);

-- Storage RLS for the courses bucket (bucket created via storage tool)
CREATE POLICY "Course images public read" ON storage.objects FOR SELECT USING (bucket_id = 'courses');
CREATE POLICY "Auth upload course images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'courses' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own course images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'courses' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own course images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'courses' AND (storage.foldername(name))[1] = auth.uid()::text);
