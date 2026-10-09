
CREATE TYPE public.event_invite_kind AS ENUM ('community','tournament','league','round');
CREATE TYPE public.event_invite_status AS ENUM ('pending','sent','delivered','failed','cancelled');
CREATE TYPE public.event_invite_rsvp AS ENUM ('none','going','maybe','declined');

CREATE TABLE public.event_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_kind public.event_invite_kind NOT NULL,
  event_id uuid NOT NULL,
  event_title text,
  event_starts_at timestamptz,
  event_location text,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invitee_email text,
  invitee_phone text,
  invitee_name text,
  personal_message text,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status public.event_invite_status NOT NULL DEFAULT 'pending',
  rsvp public.event_invite_rsvp NOT NULL DEFAULT 'none',
  send_email boolean NOT NULL DEFAULT true,
  email_sent_at timestamptz,
  responded_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_invites_event_idx ON public.event_invites (event_kind, event_id);
CREATE INDEX event_invites_inviter_idx ON public.event_invites (inviter_id, created_at DESC);
CREATE INDEX event_invites_invitee_user_idx ON public.event_invites (invitee_user_id) WHERE invitee_user_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_invites TO authenticated;
GRANT ALL ON public.event_invites TO service_role;

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

-- Inviter can manage rows they created
CREATE POLICY "invites_inviter_all" ON public.event_invites
  FOR ALL TO authenticated
  USING (auth.uid() = inviter_id)
  WITH CHECK (auth.uid() = inviter_id);

-- Invited user (matched by user id) can view + respond (update rsvp) via server fn checks
CREATE POLICY "invites_invitee_select" ON public.event_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = invitee_user_id);

CREATE POLICY "invites_invitee_update" ON public.event_invites
  FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_user_id)
  WITH CHECK (auth.uid() = invitee_user_id);

CREATE TRIGGER trg_event_invites_updated_at
  BEFORE UPDATE ON public.event_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
