-- 1. Enum
DO $$ BEGIN
  CREATE TYPE public.entity_kind AS ENUM ('course_rating_profile','course','tournament','league','profile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.revert_request_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. entity_revisions
CREATE TABLE IF NOT EXISTS public.entity_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_kind NOT NULL,
  entity_id UUID NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  before_data JSONB,
  after_data JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entity_revisions_lookup ON public.entity_revisions(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_revisions_by ON public.entity_revisions(changed_by, created_at DESC);

GRANT SELECT, INSERT ON public.entity_revisions TO authenticated;
GRANT ALL ON public.entity_revisions TO service_role;
ALTER TABLE public.entity_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revisions_admin_all" ON public.entity_revisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "revisions_self_read" ON public.entity_revisions FOR SELECT TO authenticated
  USING (changed_by = auth.uid());
CREATE POLICY "revisions_insert_self" ON public.entity_revisions FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- 3. revert_requests
CREATE TABLE IF NOT EXISTS public.revert_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES public.entity_revisions(id) ON DELETE CASCADE,
  entity_type public.entity_kind NOT NULL,
  entity_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.revert_request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revert_requests_status ON public.revert_requests(status, created_at DESC);

GRANT SELECT, INSERT ON public.revert_requests TO authenticated;
GRANT UPDATE ON public.revert_requests TO authenticated;
GRANT ALL ON public.revert_requests TO service_role;
ALTER TABLE public.revert_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revert_admin_all" ON public.revert_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "revert_self_read" ON public.revert_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
CREATE POLICY "revert_insert_self" ON public.revert_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "revert_admin_update" ON public.revert_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 4. field_registry
CREATE TABLE IF NOT EXISTS public.field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_kind NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  data_type TEXT NOT NULL,
  field_group TEXT NOT NULL DEFAULT 'General',
  order_index INTEGER NOT NULL DEFAULT 100,
  help_text TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  editable_by_owner BOOLEAN NOT NULL DEFAULT true,
  editable_by_admin BOOLEAN NOT NULL DEFAULT true,
  visible_to_public BOOLEAN NOT NULL DEFAULT true,
  deprecated BOOLEAN NOT NULL DEFAULT false,
  options JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, field_key)
);

GRANT SELECT ON public.field_registry TO authenticated;
GRANT ALL ON public.field_registry TO service_role;
ALTER TABLE public.field_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fields_read_auth" ON public.field_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "fields_admin_write" ON public.field_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_field_registry_updated_at BEFORE UPDATE ON public.field_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Seed field_registry from information_schema
DO $$
DECLARE
  rec RECORD;
  ekind public.entity_kind;
  is_system BOOLEAN;
  is_owner_editable BOOLEAN;
  is_admin_only BOOLEAN;
  friendly_label TEXT;
  ftype TEXT;
BEGIN
  FOR rec IN
    SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.ordinal_position
      FROM information_schema.columns c
     WHERE c.table_schema='public'
       AND c.table_name IN ('course_rating_profiles','courses','tournaments','leagues','profiles')
     ORDER BY c.table_name, c.ordinal_position
  LOOP
    ekind := CASE rec.table_name
      WHEN 'course_rating_profiles' THEN 'course_rating_profile'::public.entity_kind
      WHEN 'courses' THEN 'course'::public.entity_kind
      WHEN 'tournaments' THEN 'tournament'::public.entity_kind
      WHEN 'leagues' THEN 'league'::public.entity_kind
      WHEN 'profiles' THEN 'profile'::public.entity_kind
    END;

    is_system := rec.column_name IN ('id','created_at','updated_at','submitted_at','submitted_by','reviewed_by','reviewed_at','owner_id','created_by','slug');
    is_admin_only := rec.column_name IN ('moderation_status','status','locked','rejection_reason','is_ghost','auto_populated','confidence','source_mix','boundary_locked');
    is_owner_editable := NOT is_system AND NOT is_admin_only;

    ftype := CASE
      WHEN rec.data_type IN ('integer','bigint','smallint') THEN 'integer'
      WHEN rec.data_type IN ('numeric','double precision','real') THEN 'number'
      WHEN rec.data_type = 'boolean' THEN 'boolean'
      WHEN rec.data_type = 'date' THEN 'date'
      WHEN rec.data_type LIKE 'timestamp%' THEN 'datetime'
      WHEN rec.data_type = 'jsonb' THEN 'json'
      WHEN rec.data_type = 'uuid' THEN 'uuid'
      WHEN rec.data_type = 'ARRAY' THEN 'array'
      WHEN rec.data_type = 'USER-DEFINED' THEN 'enum'
      WHEN rec.data_type = 'time without time zone' THEN 'time'
      ELSE 'text'
    END;

    friendly_label := initcap(replace(rec.column_name, '_', ' '));

    INSERT INTO public.field_registry (
      entity_type, field_key, label, data_type, field_group, order_index,
      required, editable_by_owner, editable_by_admin, visible_to_public, deprecated
    ) VALUES (
      ekind, rec.column_name, friendly_label, ftype,
      CASE
        WHEN rec.column_name IN ('name','username','display_name','description','bio','slug') THEN 'Identity'
        WHEN rec.column_name IN ('city','state','country','latitude','longitude','location','time_zone','home_state','home_course') THEN 'Location'
        WHEN rec.column_name IN ('ssa','stroke_value','par_total','sample_size','round_summaries','rated_rounds','pdga_rating','confidence','source_mix') THEN 'Ratings'
        WHEN rec.column_name IN ('pdga_sanctioned','pdga_tier','pdga_event_number','pdga_course_ref','pdga_course_name','pdga_course_url','pdga_number','preferred_division') THEN 'PDGA'
        WHEN rec.column_name IN ('entry_fee_cents','ace_pot_cents','ctp_cents','players_pack_cents','payout_type','payout_ratio','payout_plan','payout_notes','ace_pot_enabled','ctp_enabled') THEN 'Fees & Payouts'
        WHEN rec.column_name IN ('td_name','td_email','td_phone','rules_url','website_url','registration_url','dgs_event_url','dgs_course_url','dgs_course_id') THEN 'Contact & Links'
        WHEN rec.column_name IN ('start_date','end_date','registration_opens','registration_closes','check_in_opens','players_meeting_at','day_of_week','start_time','holes_played','weeks_planned','best_n_weeks','season') THEN 'Schedule'
        WHEN rec.column_name IN ('cover_url','avatar_url','flythrough_url','flythrough_path','flythrough_poster_url','overview_snapshot_path') THEN 'Media'
        WHEN rec.column_name IN ('moderation_status','status','locked','rejection_reason','is_ghost','auto_populated','boundary_locked','reviewed_by','reviewed_at','submitted_by','submitted_at') THEN 'Moderation'
        ELSE 'General'
      END,
      rec.ordinal_position * 10,
      rec.is_nullable = 'NO' AND rec.column_name NOT IN ('id','created_at','updated_at'),
      is_owner_editable,
      NOT is_system,
      NOT (rec.column_name IN ('td_email','td_phone','ics_feed_token','rejection_reason')),
      false
    )
    ON CONFLICT (entity_type, field_key) DO NOTHING;
  END LOOP;
END $$;