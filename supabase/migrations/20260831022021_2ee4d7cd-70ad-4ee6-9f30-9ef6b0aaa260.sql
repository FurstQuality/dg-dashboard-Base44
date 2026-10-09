ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS posted_as_club boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_manage_club(_club_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = _club_id AND c.owner_id = _user
  ) OR EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.club_id = _club_id AND m.user_id = _user AND m.role IN ('owner','admin')
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_club(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_club(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_club(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_post_club_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.posted_as_club IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.club_id IS NULL OR NOT public.can_manage_club(NEW.club_id, NEW.author_id) THEN
    NEW.posted_as_club := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_post_club_author() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_post_club_author() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_post_club_author() FROM authenticated;

DROP TRIGGER IF EXISTS enforce_post_club_author_trg ON public.posts;
CREATE TRIGGER enforce_post_club_author_trg
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_post_club_author();