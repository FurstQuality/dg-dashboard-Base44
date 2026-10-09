
CREATE TABLE public.caddy_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caddy_conversations_user_idx ON public.caddy_conversations(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caddy_conversations TO authenticated;
GRANT ALL ON public.caddy_conversations TO service_role;
ALTER TABLE public.caddy_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own caddy convos" ON public.caddy_conversations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.caddy_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.caddy_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caddy_messages_conv_idx ON public.caddy_messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caddy_messages TO authenticated;
GRANT ALL ON public.caddy_messages TO service_role;
ALTER TABLE public.caddy_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own caddy messages" ON public.caddy_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER caddy_conv_updated
  BEFORE UPDATE ON public.caddy_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
