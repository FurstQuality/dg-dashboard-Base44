
DO $$ BEGIN
  CREATE TYPE public.post_visibility AS ENUM ('public','friends','club');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS visibility public.post_visibility NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS repost_of uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS posts_repost_of_idx ON public.posts(repost_of);
CREATE INDEX IF NOT EXISTS posts_visibility_created_idx ON public.posts(visibility, created_at DESC);

CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = _a AND f.addressee_id = _b)
        OR (f.requester_id = _b AND f.addressee_id = _a))
  )
$$;
REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_friends(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS posts_public_read ON public.posts;
CREATE POLICY posts_read_visible ON public.posts
FOR SELECT
USING (
  hidden_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.author_id)
       OR (b.blocker_id = posts.author_id AND b.blocked_id = auth.uid())
  )
  AND (
    author_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'friends' AND auth.uid() IS NOT NULL AND public.are_friends(auth.uid(), author_id))
    OR (visibility = 'club' AND club_id IS NOT NULL AND auth.uid() IS NOT NULL AND public.is_club_member(club_id, auth.uid()))
  )
);

CREATE TABLE IF NOT EXISTS public.post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS post_reports_status_idx ON public.post_reports(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.post_reports TO authenticated;
GRANT ALL ON public.post_reports TO service_role;
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_reports_insert_self ON public.post_reports;
CREATE POLICY post_reports_insert_self ON public.post_reports
FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS post_reports_read ON public.post_reports;
CREATE POLICY post_reports_read ON public.post_reports
FOR SELECT TO authenticated
USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS post_reports_admin_update ON public.post_reports;
CREATE POLICY post_reports_admin_update ON public.post_reports
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.muted_authors (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  muted_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_id)
);
GRANT SELECT, INSERT, DELETE ON public.muted_authors TO authenticated;
GRANT ALL ON public.muted_authors TO service_role;
ALTER TABLE public.muted_authors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS muted_authors_own ON public.muted_authors;
CREATE POLICY muted_authors_own ON public.muted_authors
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.hidden_posts (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.hidden_posts TO authenticated;
GRANT ALL ON public.hidden_posts TO service_role;
ALTER TABLE public.hidden_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hidden_posts_own ON public.hidden_posts;
CREATE POLICY hidden_posts_own ON public.hidden_posts
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
