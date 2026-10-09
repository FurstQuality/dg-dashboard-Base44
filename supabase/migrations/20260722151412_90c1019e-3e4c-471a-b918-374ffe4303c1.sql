
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'dm',
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_kind_check') THEN
    ALTER TABLE public.conversations ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('dm','group'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_contact_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','phone')),
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hash)
);
CREATE INDEX IF NOT EXISTS user_contact_hashes_hash_idx ON public.user_contact_hashes(hash);
GRANT SELECT, INSERT, DELETE ON public.user_contact_hashes TO authenticated;
GRANT ALL ON public.user_contact_hashes TO service_role;
ALTER TABLE public.user_contact_hashes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own contact hashes"
  ON public.user_contact_hashes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.external_chat_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('club','league','tournament')),
  owner_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook_group','facebook_messenger','whatsapp','discord','groupme','telegram','slack','other')),
  url text NOT NULL,
  label text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_chat_links_owner_idx ON public.external_chat_links(owner_type, owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_chat_links TO authenticated;
GRANT ALL ON public.external_chat_links TO service_role;
ALTER TABLE public.external_chat_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view external chat links"
  ON public.external_chat_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners can add external chat links"
  ON public.external_chat_links FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      (owner_type = 'club'       AND EXISTS (SELECT 1 FROM public.clubs c       WHERE c.id = owner_id AND c.owner_id = auth.uid())) OR
      (owner_type = 'league'     AND EXISTS (SELECT 1 FROM public.leagues l     WHERE l.id = owner_id AND l.owner_id = auth.uid())) OR
      (owner_type = 'tournament' AND EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = owner_id AND t.owner_id = auth.uid()))
    )
  );

CREATE POLICY "Creator or owner can update external chat links"
  ON public.external_chat_links FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() OR
    (owner_type = 'club'       AND EXISTS (SELECT 1 FROM public.clubs c       WHERE c.id = owner_id AND c.owner_id = auth.uid())) OR
    (owner_type = 'league'     AND EXISTS (SELECT 1 FROM public.leagues l     WHERE l.id = owner_id AND l.owner_id = auth.uid())) OR
    (owner_type = 'tournament' AND EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = owner_id AND t.owner_id = auth.uid()))
  );

CREATE POLICY "Creator or owner can delete external chat links"
  ON public.external_chat_links FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() OR
    (owner_type = 'club'       AND EXISTS (SELECT 1 FROM public.clubs c       WHERE c.id = owner_id AND c.owner_id = auth.uid())) OR
    (owner_type = 'league'     AND EXISTS (SELECT 1 FROM public.leagues l     WHERE l.id = owner_id AND l.owner_id = auth.uid())) OR
    (owner_type = 'tournament' AND EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = owner_id AND t.owner_id = auth.uid()))
  );

DROP TRIGGER IF EXISTS external_chat_links_set_updated_at ON public.external_chat_links;
CREATE TRIGGER external_chat_links_set_updated_at
  BEFORE UPDATE ON public.external_chat_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_invites_token_idx ON public.conversation_invites(token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_invites TO authenticated;
GRANT ALL ON public.conversation_invites TO service_role;
ALTER TABLE public.conversation_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any signed-in user can look up invites"
  ON public.conversation_invites FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members can create invites"
  ON public.conversation_invites FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Creator can revoke invites"
  ON public.conversation_invites FOR DELETE TO authenticated
  USING (created_by = auth.uid());
