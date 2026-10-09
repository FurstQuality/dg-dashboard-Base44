CREATE TABLE public.post_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tagged_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tagged_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, tagged_user_id)
);

CREATE INDEX post_tags_post_id_idx ON public.post_tags (post_id);
CREATE INDEX post_tags_tagged_user_idx ON public.post_tags (tagged_user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.post_tags TO authenticated;
GRANT ALL ON public.post_tags TO service_role;

ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tags are readable when the post is readable"
  ON public.post_tags FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_tags.post_id
        AND (
          p.author_id = auth.uid()
          OR p.visibility = 'public'
          OR public.are_friends(auth.uid(), p.author_id)
        )
    )
    OR tagged_user_id = auth.uid()
  );

CREATE POLICY "Post authors can tag accepted friends"
  ON public.post_tags FOR INSERT TO authenticated
  WITH CHECK (
    tagged_by = auth.uid()
    AND tagged_user_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_tags.post_id AND p.author_id = auth.uid()
    )
    AND public.are_friends(auth.uid(), tagged_user_id)
  );

CREATE POLICY "Authors and tagged players can remove a tag"
  ON public.post_tags FOR DELETE TO authenticated
  USING (
    tagged_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_tags.post_id AND p.author_id = auth.uid()
    )
  );