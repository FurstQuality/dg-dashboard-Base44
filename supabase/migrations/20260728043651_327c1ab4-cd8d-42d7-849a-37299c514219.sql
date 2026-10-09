
CREATE TYPE public.creator_tier AS ENUM ('none','applicant','creator','ambassador','partner');
CREATE TYPE public.creator_status AS ENUM ('pending','approved','rejected','revoked');
CREATE TYPE public.content_draft_kind AS ENUM ('photo','video','reel','news','recap','course_spotlight','ace','tip','story');
CREATE TYPE public.content_draft_status AS ENUM ('draft','scheduled','published','archived','failed');
CREATE TYPE public.ambassador_entity AS ENUM ('course','club');

-- 1. Creator profiles
CREATE TABLE public.creator_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier public.creator_tier NOT NULL DEFAULT 'none',
  status public.creator_status NOT NULL DEFAULT 'pending',
  headline text,
  bio text,
  niche_tags text[] NOT NULL DEFAULT '{}',
  content_pillars text[] NOT NULL DEFAULT '{}',
  external_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  pitch text,
  monthly_reach integer,
  applied_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  reviewer_notes text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.creator_profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.creator_profiles TO authenticated;
GRANT ALL ON public.creator_profiles TO service_role;

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator_profiles_public_read" ON public.creator_profiles
  FOR SELECT TO anon, authenticated
  USING (tier IN ('creator','ambassador','partner') AND status = 'approved');

CREATE POLICY "creator_profiles_owner_read" ON public.creator_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "creator_profiles_owner_upsert" ON public.creator_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "creator_profiles_owner_update" ON public.creator_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "creator_profiles_admin_all" ON public.creator_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_creator_profiles_updated_at
  BEFORE UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Content series
CREATE TABLE public.content_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  description text,
  cover_url text,
  cadence text,
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_series_user_idx ON public.content_series(user_id, created_at DESC);

GRANT SELECT ON public.content_series TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_series TO authenticated;
GRANT ALL ON public.content_series TO service_role;

ALTER TABLE public.content_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_series_public_read" ON public.content_series
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "content_series_owner_all" ON public.content_series
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_content_series_updated_at
  BEFORE UPDATE ON public.content_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Content drafts (drafts + scheduled + published)
CREATE TABLE public.content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.content_draft_kind NOT NULL DEFAULT 'photo',
  status public.content_draft_status NOT NULL DEFAULT 'draft',
  title text,
  body text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  mentions text[] NOT NULL DEFAULT '{}',
  course_id uuid,
  event_id uuid,
  round_id uuid,
  series_id uuid REFERENCES public.content_series(id) ON DELETE SET NULL,
  club_id uuid,
  scheduled_at timestamptz,
  published_at timestamptz,
  published_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  publish_error text,
  cross_post_targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_drafts_user_idx ON public.content_drafts(user_id, status, scheduled_at);
CREATE INDEX content_drafts_scheduled_idx ON public.content_drafts(status, scheduled_at)
  WHERE status = 'scheduled';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_drafts TO authenticated;
GRANT ALL ON public.content_drafts TO service_role;

ALTER TABLE public.content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_drafts_owner_all" ON public.content_drafts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_content_drafts_updated_at
  BEFORE UPDATE ON public.content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Content ideas
CREATE TABLE public.content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  notes text,
  source text,
  suggested_kind public.content_draft_kind,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_ideas_user_idx ON public.content_ideas(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_ideas TO authenticated;
GRANT ALL ON public.content_ideas TO service_role;

ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_ideas_owner_all" ON public.content_ideas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Content ambassadors
CREATE TABLE public.content_ambassadors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_kind public.ambassador_entity NOT NULL,
  entity_id uuid NOT NULL,
  entity_name text,
  role_title text,
  is_active boolean NOT NULL DEFAULT true,
  approved_by uuid,
  since timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_kind, entity_id)
);
CREATE INDEX content_ambassadors_user_idx ON public.content_ambassadors(user_id) WHERE is_active;
CREATE INDEX content_ambassadors_entity_idx ON public.content_ambassadors(entity_kind, entity_id) WHERE is_active;

GRANT SELECT ON public.content_ambassadors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_ambassadors TO authenticated;
GRANT ALL ON public.content_ambassadors TO service_role;

ALTER TABLE public.content_ambassadors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_ambassadors_public_read" ON public.content_ambassadors
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "content_ambassadors_owner_insert" ON public.content_ambassadors
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "content_ambassadors_owner_update" ON public.content_ambassadors
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "content_ambassadors_admin_all" ON public.content_ambassadors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER trg_content_ambassadors_updated_at
  BEFORE UPDATE ON public.content_ambassadors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Post impressions (daily aggregate)
CREATE TABLE public.post_impressions (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  impressions integer NOT NULL DEFAULT 0,
  unique_viewers integer NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, day)
);
CREATE INDEX post_impressions_post_idx ON public.post_impressions(post_id);

GRANT SELECT, INSERT, UPDATE ON public.post_impressions TO authenticated;
GRANT ALL ON public.post_impressions TO service_role;

ALTER TABLE public.post_impressions ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can see aggregate impressions (used to display view counts)
CREATE POLICY "post_impressions_read" ON public.post_impressions
  FOR SELECT TO authenticated USING (true);

-- Only the post author (or service_role) can insert/update rows for their post
CREATE POLICY "post_impressions_author_write" ON public.post_impressions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_impressions.post_id AND p.author_id = auth.uid()));

CREATE POLICY "post_impressions_author_update" ON public.post_impressions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_impressions.post_id AND p.author_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_impressions.post_id AND p.author_id = auth.uid()));

-- 7. Helper: publish scheduled drafts whose time has come
CREATE OR REPLACE FUNCTION public.publish_due_content_drafts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  new_post_id uuid;
  published_count integer := 0;
  post_kind public.post_type;
BEGIN
  FOR r IN
    SELECT * FROM public.content_drafts
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    LIMIT 100
  LOOP
    BEGIN
      -- map draft kind to post_type enum
      post_kind := CASE r.kind
        WHEN 'photo' THEN 'photo'::public.post_type
        WHEN 'video' THEN 'video'::public.post_type
        WHEN 'reel' THEN 'video'::public.post_type
        WHEN 'ace' THEN 'ace'::public.post_type
        WHEN 'recap' THEN 'roundcard'::public.post_type
        ELSE 'text'::public.post_type
      END;

      INSERT INTO public.posts (author_id, type, body, media, club_id, course_name)
      VALUES (r.user_id, post_kind, COALESCE(r.body, r.title), r.media, r.club_id, NULL)
      RETURNING id INTO new_post_id;

      UPDATE public.content_drafts
      SET status = 'published',
          published_at = now(),
          published_post_id = new_post_id,
          publish_error = NULL
      WHERE id = r.id;

      published_count := published_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.content_drafts
      SET status = 'failed',
          publish_error = SQLERRM
      WHERE id = r.id;
    END;
  END LOOP;
  RETURN published_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_due_content_drafts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_due_content_drafts() TO service_role;
