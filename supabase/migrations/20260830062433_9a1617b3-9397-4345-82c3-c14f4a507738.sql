-- Friend games / duels with video proof
CREATE TABLE public.game_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key text NOT NULL,
  title text NOT NULL,
  arena text NOT NULL DEFAULT 'on_course',
  rules text,
  target_metric text,
  requires_video boolean NOT NULL DEFAULT true,
  wager_xp integer NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  winner_id uuid REFERENCES auth.users ON DELETE SET NULL,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.duel_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES public.game_duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'challenger',
  invite_status text NOT NULL DEFAULT 'invited',
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (duel_id, user_id)
);

CREATE TABLE public.duel_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES public.game_duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  score numeric,
  notes text,
  video_path text,
  video_url text,
  status text NOT NULL DEFAULT 'pending',
  verified_by uuid REFERENCES auth.users ON DELETE SET NULL,
  verified_at timestamptz,
  dispute_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_duel_participants_user ON public.duel_participants(user_id);
CREATE INDEX idx_duel_participants_duel ON public.duel_participants(duel_id);
CREATE INDEX idx_duel_submissions_duel ON public.duel_submissions(duel_id);
CREATE INDEX idx_game_duels_status ON public.game_duels(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_duels TO authenticated;
GRANT ALL ON public.game_duels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duel_participants TO authenticated;
GRANT ALL ON public.duel_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duel_submissions TO authenticated;
GRANT ALL ON public.duel_submissions TO service_role;

CREATE OR REPLACE FUNCTION public.is_duel_participant(_duel uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.duel_participants dp
    WHERE dp.duel_id = _duel AND dp.user_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.game_duels d
    WHERE d.id = _duel AND d.created_by = _user
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_duel_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_duel_participant(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.game_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their duels" ON public.game_duels
  FOR SELECT TO authenticated
  USING (public.is_duel_participant(id, auth.uid()));

CREATE POLICY "Users can create duels" ON public.game_duels
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Participants can update their duels" ON public.game_duels
  FOR UPDATE TO authenticated
  USING (public.is_duel_participant(id, auth.uid()))
  WITH CHECK (public.is_duel_participant(id, auth.uid()));

CREATE POLICY "Creators can delete their duels" ON public.game_duels
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Participants can view duel roster" ON public.duel_participants
  FOR SELECT TO authenticated
  USING (public.is_duel_participant(duel_id, auth.uid()));

CREATE POLICY "Duel creators can add participants" ON public.duel_participants
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.game_duels d
    WHERE d.id = duel_id AND d.created_by = auth.uid()
  ));

CREATE POLICY "Players manage their own roster row" ON public.duel_participants
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players can leave a duel" ON public.duel_participants
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.game_duels d
    WHERE d.id = duel_id AND d.created_by = auth.uid()
  ));

CREATE POLICY "Participants can view submissions" ON public.duel_submissions
  FOR SELECT TO authenticated
  USING (public.is_duel_participant(duel_id, auth.uid()));

CREATE POLICY "Players submit their own proof" ON public.duel_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_duel_participant(duel_id, auth.uid()));

CREATE POLICY "Participants can review submissions" ON public.duel_submissions
  FOR UPDATE TO authenticated
  USING (public.is_duel_participant(duel_id, auth.uid()))
  WITH CHECK (public.is_duel_participant(duel_id, auth.uid()));

CREATE POLICY "Players delete their own submission" ON public.duel_submissions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_game_duels_updated_at BEFORE UPDATE ON public.game_duels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_duel_participants_updated_at BEFORE UPDATE ON public.duel_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_duel_submissions_updated_at BEFORE UPDATE ON public.duel_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();