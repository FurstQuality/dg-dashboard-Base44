ALTER TABLE public.event_managers ADD COLUMN IF NOT EXISTS staff_role text NOT NULL DEFAULT 'co_td';
ALTER TABLE public.event_managers ADD COLUMN IF NOT EXISTS extra_capabilities text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.event_managers ADD COLUMN IF NOT EXISTS revoked_capabilities text[] NOT NULL DEFAULT '{}';
UPDATE public.event_managers SET staff_role = CASE WHEN access_level = 'manage' THEN 'co_td' ELSE 'view_only' END;

CREATE TABLE public.event_role_capabilities (
  staff_role text NOT NULL,
  capability text NOT NULL,
  PRIMARY KEY (staff_role, capability)
);
GRANT SELECT ON public.event_role_capabilities TO authenticated;
GRANT ALL ON public.event_role_capabilities TO service_role;
ALTER TABLE public.event_role_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads role presets" ON public.event_role_capabilities FOR SELECT TO authenticated USING (true);

INSERT INTO public.event_role_capabilities (staff_role, capability) VALUES
 ('co_td','event.check_in'),('co_td','event.manage_players'),('co_td','event.manage_scoring'),('co_td','event.manage_finance'),
 ('co_td','event.manage_course_ops'),('co_td','event.send_announcements'),('co_td','event.manage_staff'),('co_td','event.view_private'),
 ('check_in','event.check_in'),('check_in','event.view_private'),
 ('scoring','event.manage_scoring'),
 ('course_lead','event.manage_course_ops'),('course_lead','event.send_announcements'),
 ('finance','event.manage_finance'),('finance','event.view_private'),
 ('volunteer_lead','event.manage_volunteers'),('volunteer_lead','event.send_announcements'),
 ('media','event.manage_promotion'),
 ('staff','event.check_in'),
 ('view_only','event.view_private');

-- Owner-only capabilities: never granted through staff roles or extras.
CREATE OR REPLACE FUNCTION public.is_owner_only_capability(_cap text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _cap = ANY (ARRAY['event.critical_edit','event.delete','event.cancel','event.transfer_ownership',
    'event.change_host','event.change_format','event.change_sanctioning','event.finalize_results',
    'event.reopen_results','event.publish_critical'])
$$;

CREATE OR REPLACE FUNCTION public.event_owner_id(_kind text, _event uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _kind
    WHEN 'tournament' THEN (SELECT owner_id FROM public.tournaments WHERE id = _event)
    WHEN 'league' THEN (SELECT owner_id FROM public.leagues WHERE id = _event)
  END
$$;

CREATE OR REPLACE FUNCTION public.event_has_capability(_kind text, _event uuid, _user uuid, _cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN public.event_owner_id(_kind, _event) = _user THEN true
    WHEN public.has_role(_user, 'super_admin') THEN true
    WHEN public.is_owner_only_capability(_cap) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.event_managers m
      WHERE m.kind = _kind AND m.event_id = _event AND m.user_id = _user
        AND NOT (_cap = ANY (m.revoked_capabilities))
        AND (_cap = ANY (m.extra_capabilities) OR EXISTS (
          SELECT 1 FROM public.event_role_capabilities rc
          WHERE rc.staff_role = m.staff_role AND rc.capability = _cap)))
  END
$$;

-- Owner-only capabilities can never be stored as staff extras.
CREATE OR REPLACE FUNCTION public.event_managers_guard_caps()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.extra_capabilities) c WHERE public.is_owner_only_capability(c)) THEN
    RAISE EXCEPTION 'Owner-only permissions cannot be given to event staff';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER event_managers_guard_caps BEFORE INSERT OR UPDATE ON public.event_managers
  FOR EACH ROW EXECUTE FUNCTION public.event_managers_guard_caps();

CREATE TABLE public.admin_override_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_override_log TO authenticated;
GRANT ALL ON public.admin_override_log TO service_role;
ALTER TABLE public.admin_override_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read overrides" ON public.admin_override_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.log_admin_override(_action text, _entity_type text, _entity_id text, _old jsonb, _new jsonb, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF coalesce(length(trim(_reason)),0) < 5 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  INSERT INTO public.admin_override_log (admin_id, action, entity_type, entity_id, old_value, new_value, reason)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old, _new, trim(_reason)) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.log_admin_override(text,text,text,jsonb,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_override(text,text,text,jsonb,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_has_capability(text,uuid,uuid,text) TO authenticated;