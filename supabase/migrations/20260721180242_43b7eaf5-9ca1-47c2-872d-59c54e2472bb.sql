
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pdga_number TEXT,
  ADD COLUMN IF NOT EXISTS pdga_rating INTEGER,
  ADD COLUMN IF NOT EXISTS home_state TEXT,
  ADD COLUMN IF NOT EXISTS player_since INTEGER;

CREATE TABLE public.external_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  course_name TEXT NOT NULL,
  layout_name TEXT,
  event_name TEXT,
  played_on DATE NOT NULL,
  score INTEGER NOT NULL,
  to_par INTEGER,
  round_rating INTEGER,
  ssa NUMERIC(6,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_rounds TO authenticated;
GRANT ALL ON public.external_rounds TO service_role;
ALTER TABLE public.external_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in views external rounds" ON public.external_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner inserts external round" ON public.external_rounds FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates external round" ON public.external_rounds FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner deletes external round" ON public.external_rounds FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_ext_rounds_updated BEFORE UPDATE ON public.external_rounds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ext_rounds_user_date ON public.external_rounds(user_id, played_on DESC);
