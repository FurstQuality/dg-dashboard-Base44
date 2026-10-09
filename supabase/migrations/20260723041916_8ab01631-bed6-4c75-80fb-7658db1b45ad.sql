
CREATE TABLE public.pdga_friend_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdga_number text NOT NULL,
  display_name text,
  pdga_rating integer,
  location text,
  invite_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'base64'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','joined','cancelled')),
  joined_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inviter_id, pdga_number)
);

CREATE INDEX pdga_friend_invites_pdga_idx ON public.pdga_friend_invites (pdga_number);
CREATE INDEX profiles_pdga_number_idx ON public.profiles (pdga_number) WHERE pdga_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdga_friend_invites TO authenticated;
GRANT SELECT ON public.pdga_friend_invites TO anon;
GRANT ALL ON public.pdga_friend_invites TO service_role;

ALTER TABLE public.pdga_friend_invites ENABLE ROW LEVEL SECURITY;

-- Inviter can manage their own invites
CREATE POLICY "pdga_invites_owner_all" ON public.pdga_friend_invites
  FOR ALL TO authenticated
  USING (auth.uid() = inviter_id)
  WITH CHECK (auth.uid() = inviter_id);

-- Anyone (including anon) can read a specific invite by token via the API;
-- policy allows SELECT of pending invites so the public share page works.
CREATE POLICY "pdga_invites_public_pending_read" ON public.pdga_friend_invites
  FOR SELECT TO anon, authenticated
  USING (status = 'pending');

CREATE TRIGGER pdga_friend_invites_touch
  BEFORE UPDATE ON public.pdga_friend_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- When a profile is inserted/updated with a pdga_number, convert pending invites
-- into accepted friendships and mark them joined.
CREATE OR REPLACE FUNCTION public.link_pdga_friend_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  IF NEW.pdga_number IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.pdga_number IS NOT DISTINCT FROM NEW.pdga_number) THEN
    RETURN NEW;
  END IF;

  FOR inv IN
    SELECT * FROM public.pdga_friend_invites
     WHERE pdga_number = NEW.pdga_number AND status = 'pending'
       AND inviter_id <> NEW.id
  LOOP
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (inv.inviter_id, NEW.id, 'accepted')
    ON CONFLICT DO NOTHING;

    UPDATE public.pdga_friend_invites
       SET status = 'joined', joined_user_id = NEW.id, updated_at = now()
     WHERE id = inv.id;

    INSERT INTO public.notifications (user_id, actor_id, type, payload)
    VALUES (
      inv.inviter_id, NEW.id, 'friend_accept',
      jsonb_build_object('via', 'pdga_invite', 'pdga_number', NEW.pdga_number)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_link_pdga_invites
  AFTER INSERT OR UPDATE OF pdga_number ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.link_pdga_friend_invites();
