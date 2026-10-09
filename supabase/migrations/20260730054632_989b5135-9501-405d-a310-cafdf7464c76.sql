CREATE TYPE public.beta_feedback_kind AS ENUM ('bug','idea','rating');
CREATE TYPE public.beta_feedback_status AS ENUM ('new','triaged','in_progress','resolved','wont_fix','duplicate');
CREATE TYPE public.beta_feedback_severity AS ENUM ('blocker','major','minor','cosmetic');

CREATE TABLE public.beta_program (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  is_enabled boolean NOT NULL DEFAULT false,
  program_name text NOT NULL DEFAULT 'DG Dashboard Beta',
  build_label text NOT NULL DEFAULT 'beta-1',
  welcome_message text NOT NULL DEFAULT 'Thanks for testing. Use the Beta button on any screen to report a bug, suggest an improvement, or rate the page you are on.',
  focus_areas text[] NOT NULL DEFAULT ARRAY['Scoring','Tracker','Events','Community','StatLink'],
  contact_email text,
  show_banner boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.beta_program TO authenticated;
GRANT ALL ON public.beta_program TO service_role;
ALTER TABLE public.beta_program ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read beta program" ON public.beta_program FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage beta program" ON public.beta_program FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
GRANT INSERT, UPDATE ON public.beta_program TO authenticated;
INSERT INTO public.beta_program (id) VALUES (true);

CREATE TABLE public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind public.beta_feedback_kind NOT NULL DEFAULT 'bug',
  title text NOT NULL,
  body text,
  rating smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  severity public.beta_feedback_severity,
  route_path text,
  page_label text,
  feature_area text,
  user_agent text,
  viewport text,
  build_label text,
  status public.beta_feedback_status NOT NULL DEFAULT 'new',
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
  assigned_to uuid,
  resolution_note text,
  vote_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_feedback_status_idx ON public.beta_feedback (status, created_at DESC);
CREATE INDEX beta_feedback_user_idx ON public.beta_feedback (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_feedback TO authenticated;
GRANT ALL ON public.beta_feedback TO service_role;
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Testers read own feedback" ON public.beta_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Testers create feedback" ON public.beta_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Testers edit own feedback" ON public.beta_feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Owner or admin deletes feedback" ON public.beta_feedback FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER beta_feedback_touch BEFORE UPDATE ON public.beta_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.beta_feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.beta_feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_feedback_comments_idx ON public.beta_feedback_comments (feedback_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.beta_feedback_comments TO authenticated;
GRANT ALL ON public.beta_feedback_comments TO service_role;
ALTER TABLE public.beta_feedback_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read comments on visible feedback" ON public.beta_feedback_comments FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin')
    OR (is_internal = false AND EXISTS (
      SELECT 1 FROM public.beta_feedback f WHERE f.id = feedback_id AND f.user_id = auth.uid()
    ))
  );
CREATE POLICY "Write own comments" ON public.beta_feedback_comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (is_internal = false OR public.has_role(auth.uid(),'super_admin'))
    AND EXISTS (
      SELECT 1 FROM public.beta_feedback f
      WHERE f.id = feedback_id AND (f.user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'))
    )
  );
CREATE POLICY "Delete own comments" ON public.beta_feedback_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.beta_feedback_votes (
  feedback_id uuid NOT NULL REFERENCES public.beta_feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.beta_feedback_votes TO authenticated;
GRANT ALL ON public.beta_feedback_votes TO service_role;
ALTER TABLE public.beta_feedback_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read votes" ON public.beta_feedback_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Vote as self" ON public.beta_feedback_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Remove own vote" ON public.beta_feedback_votes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_beta_vote_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.beta_feedback SET vote_count = vote_count + 1 WHERE id = NEW.feedback_id;
  ELSE
    UPDATE public.beta_feedback SET vote_count = GREATEST(vote_count - 1, 0) WHERE id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_beta_vote_count() FROM PUBLIC;
CREATE TRIGGER beta_votes_count AFTER INSERT OR DELETE ON public.beta_feedback_votes
  FOR EACH ROW EXECUTE FUNCTION public.bump_beta_vote_count();

CREATE OR REPLACE FUNCTION public.bump_beta_comment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.beta_feedback SET comment_count = comment_count + 1 WHERE id = NEW.feedback_id;
  ELSE
    UPDATE public.beta_feedback SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.feedback_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.bump_beta_comment_count() FROM PUBLIC;
CREATE TRIGGER beta_comments_count AFTER INSERT OR DELETE ON public.beta_feedback_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_beta_comment_count();