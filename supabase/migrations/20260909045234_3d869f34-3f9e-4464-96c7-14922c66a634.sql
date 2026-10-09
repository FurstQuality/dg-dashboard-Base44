-- 1. Director application status enum
DO $$ BEGIN
  CREATE TYPE public.director_status AS ENUM ('pending','approved','rejected','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Director applications
CREATE TABLE IF NOT EXISTS public.director_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.director_status NOT NULL DEFAULT 'pending',
  org_name text,
  region text,
  experience text,
  pitch text,
  pdga_number integer,
  contact_email text,
  reviewer_notes text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.director_profiles TO authenticated;
GRANT ALL ON public.director_profiles TO service_role;

ALTER TABLE public.director_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS director_profiles_owner_read ON public.director_profiles;
CREATE POLICY director_profiles_owner_read ON public.director_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS director_profiles_owner_insert ON public.director_profiles;
CREATE POLICY director_profiles_owner_insert ON public.director_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS director_profiles_owner_update ON public.director_profiles;
CREATE POLICY director_profiles_owner_update ON public.director_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS director_profiles_admin_all ON public.director_profiles;
CREATE POLICY director_profiles_admin_all ON public.director_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_director_profiles_updated_at ON public.director_profiles;
CREATE TRIGGER update_director_profiles_updated_at
  BEFORE UPDATE ON public.director_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Only admins may set review fields (no self-approval)
CREATE OR REPLACE FUNCTION public.guard_director_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin');
  IF is_admin THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    NEW.reviewer_notes := NULL;
  ELSE
    NEW.status := OLD.status;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    NEW.reviewer_notes := OLD.reviewer_notes;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_director_review_trg ON public.director_profiles;
CREATE TRIGGER guard_director_review_trg
  BEFORE INSERT OR UPDATE ON public.director_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_director_review();

-- 4. Access helpers
CREATE OR REPLACE FUNCTION public.is_approved_director(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT true FROM public.director_profiles
      WHERE user_id = _user AND status = 'approved' LIMIT 1),
    false)
    OR public.has_role(_user,'admin')
    OR public.has_role(_user,'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_approved_creator(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT true FROM public.creator_profiles
      WHERE user_id = _user AND status = 'approved' LIMIT 1),
    false)
    OR public.has_role(_user,'admin')
    OR public.has_role(_user,'super_admin');
$$;

-- 5. Keep the public profile badge in sync with the approved application
CREATE OR REPLACE FUNCTION public.sync_director_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
     SET is_event_director = (NEW.status = 'approved')
   WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sync_director_badge_trg ON public.director_profiles;
CREATE TRIGGER sync_director_badge_trg
  AFTER INSERT OR UPDATE OF status ON public.director_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_director_badge();

-- 6. Players cannot self-assign the director badge on their profile
CREATE OR REPLACE FUNCTION public.guard_profile_director_flag()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_event_director IS DISTINCT FROM OLD.is_event_director THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
            OR auth.uid() IS NULL) THEN
      NEW.is_event_director := OLD.is_event_director;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_profile_director_flag_trg ON public.profiles;
CREATE TRIGGER guard_profile_director_flag_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_director_flag();

-- 7. Backfill existing directors and event owners as approved
INSERT INTO public.director_profiles (user_id, status, approved_at)
SELECT p.id, 'approved'::public.director_status, now()
  FROM public.profiles p
 WHERE p.is_event_director IS TRUE
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.director_profiles (user_id, status, approved_at)
SELECT DISTINCT owner_id, 'approved'::public.director_status, now() FROM public.tournaments WHERE owner_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.director_profiles (user_id, status, approved_at)
SELECT DISTINCT owner_id, 'approved'::public.director_status, now() FROM public.leagues WHERE owner_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- 8. Creation of tournaments/leagues limited to approved directors
DROP POLICY IF EXISTS "TDs create tournaments" ON public.tournaments;
CREATE POLICY "TDs create tournaments" ON public.tournaments
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.is_approved_director(auth.uid()));

DROP POLICY IF EXISTS "Owner creates league" ON public.leagues;
CREATE POLICY "Owner creates league" ON public.leagues
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.is_approved_director(auth.uid()));

-- 9. Creator Studio content limited to approved creators
DROP POLICY IF EXISTS content_drafts_owner_all ON public.content_drafts;
CREATE POLICY content_drafts_owner_select ON public.content_drafts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY content_drafts_owner_insert ON public.content_drafts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_approved_creator(auth.uid()));
CREATE POLICY content_drafts_owner_update ON public.content_drafts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY content_drafts_owner_delete ON public.content_drafts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
