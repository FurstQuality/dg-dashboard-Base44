
ALTER TABLE public.course_features
  ADD COLUMN IF NOT EXISTS layer text NOT NULL DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS publish_state text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS event_overlay_id uuid,
  ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS boundary_confidence text;

-- backfill layers from existing objects
UPDATE public.course_features SET layer = CASE
  WHEN type IN ('ob_line','ob_area','ob_reference','mando','dropzone','island_green','tee_sign')
       AND (layout_id IS NOT NULL OR hole_number IS NOT NULL OR coalesce(array_length(hole_numbers,1),0)>0) THEN 'layout'
  ELSE 'base' END;
UPDATE public.course_features SET flagged_for_review = true
  WHERE type IN ('ob_line','ob_area','ob_reference','mando','dropzone','island_green')
    AND layout_id IS NULL AND hole_number IS NULL AND coalesce(array_length(hole_numbers,1),0)=0;
UPDATE public.course_features SET boundary_confidence = 'APPROXIMATE' WHERE type='course_boundary';

ALTER TABLE public.course_features
  ADD CONSTRAINT course_features_layer_chk CHECK (layer IN ('base','layout','event','condition')),
  ADD CONSTRAINT course_features_verif_chk CHECK (verification IN ('UNVERIFIED','COMMUNITY_CONFIRMED','STEWARD_VERIFIED','OFFICIAL')),
  ADD CONSTRAINT course_features_pub_chk CHECK (publish_state IN ('draft','published','archived')),
  ADD CONSTRAINT course_features_bconf_chk CHECK (boundary_confidence IS NULL OR boundary_confidence IN ('OFFICIAL','APPROXIMATE','UNKNOWN'));
CREATE INDEX IF NOT EXISTS course_features_course_layer_idx ON public.course_features(course_id, layer, publish_state);

ALTER TABLE public.course_layouts ADD COLUMN IF NOT EXISTS effective_from date, ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.hole_tees ADD COLUMN IF NOT EXISTS surface text;
ALTER TABLE public.hole_baskets ADD COLUMN IF NOT EXISTS basket_type text, ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- stewards
CREATE TABLE public.course_stewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'STEWARD' CHECK (role IN ('CONTRIBUTOR','STEWARD','COURSE_ADMIN')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, user_id)
);
GRANT SELECT ON public.course_stewards TO authenticated;
GRANT ALL ON public.course_stewards TO service_role;
ALTER TABLE public.course_stewards ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_steward_course(_course uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    public.has_role(_user,'admin') OR public.has_role(_user,'super_admin')
    OR EXISTS (SELECT 1 FROM courses c WHERE c.id=_course AND c.created_by=_user)
    OR EXISTS (SELECT 1 FROM course_stewards s WHERE s.course_id=_course AND s.user_id=_user AND s.role IN ('STEWARD','COURSE_ADMIN')))
$$;
GRANT EXECUTE ON FUNCTION public.can_steward_course(uuid,uuid) TO authenticated;

CREATE POLICY "Signed-in read stewards" ON public.course_stewards FOR SELECT TO authenticated USING (true);

-- stewards may edit features too
CREATE POLICY "Stewards insert features" ON public.course_features FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_steward_course(course_id, auth.uid()));
CREATE POLICY "Stewards update features" ON public.course_features FOR UPDATE TO authenticated
  USING (public.can_steward_course(course_id, auth.uid())) WITH CHECK (public.can_steward_course(course_id, auth.uid()));
CREATE POLICY "Stewards delete features" ON public.course_features FOR DELETE TO authenticated
  USING (public.can_steward_course(course_id, auth.uid()));

-- history
CREATE TABLE public.course_feature_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id uuid NOT NULL,
  course_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  revision integer,
  before_data jsonb,
  after_data jsonb,
  verification text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.course_feature_history(course_id, created_at DESC);
GRANT SELECT ON public.course_feature_history TO authenticated;
GRANT ALL ON public.course_feature_history TO service_role;
ALTER TABLE public.course_feature_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read map history" ON public.course_feature_history FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.course_feature_track()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.geometry IS DISTINCT FROM OLD.geometry OR NEW.label IS DISTINCT FROM OLD.label OR NEW.type IS DISTINCT FROM OLD.type THEN
      NEW.revision := OLD.revision + 1;
    END IF;
    INSERT INTO course_feature_history(feature_id,course_id,action,revision,before_data,after_data,verification,changed_by)
      VALUES (OLD.id, OLD.course_id,'update',NEW.revision,to_jsonb(OLD),to_jsonb(NEW),NEW.verification,auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO course_feature_history(feature_id,course_id,action,revision,before_data,verification,changed_by)
      VALUES (OLD.id, OLD.course_id,'delete',OLD.revision,to_jsonb(OLD),OLD.verification,auth.uid());
    RETURN OLD;
  ELSE
    INSERT INTO course_feature_history(feature_id,course_id,action,revision,after_data,verification,changed_by)
      VALUES (NEW.id, NEW.course_id,'insert',NEW.revision,to_jsonb(NEW),NEW.verification,auth.uid());
    RETURN NEW;
  END IF;
END $$;
CREATE TRIGGER course_feature_track_upd BEFORE UPDATE ON public.course_features FOR EACH ROW EXECUTE FUNCTION public.course_feature_track();
CREATE TRIGGER course_feature_track_ins AFTER INSERT ON public.course_features FOR EACH ROW EXECUTE FUNCTION public.course_feature_track();
CREATE TRIGGER course_feature_track_del AFTER DELETE ON public.course_features FOR EACH ROW EXECUTE FUNCTION public.course_feature_track();

-- proposals
CREATE TABLE public.course_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  feature_id uuid,
  kind text NOT NULL CHECK (kind IN ('move','add','remove','edit')),
  current_value jsonb,
  proposed_value jsonb NOT NULL,
  reason text,
  photo_url text,
  proposed_by uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.course_change_proposals(course_id, status);
GRANT SELECT, INSERT ON public.course_change_proposals TO authenticated;
GRANT ALL ON public.course_change_proposals TO service_role;
ALTER TABLE public.course_change_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Propose changes" ON public.course_change_proposals FOR INSERT TO authenticated
  WITH CHECK (proposed_by = auth.uid() AND status='pending' AND reviewed_by IS NULL);
CREATE POLICY "Read own or steward proposals" ON public.course_change_proposals FOR SELECT TO authenticated
  USING (proposed_by = auth.uid() OR public.can_steward_course(course_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.review_course_proposal(_id uuid, _approve boolean, _override jsonb DEFAULT NULL, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p course_change_proposals; v jsonb; fid uuid;
BEGIN
  SELECT * INTO p FROM course_change_proposals WHERE id=_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF NOT can_steward_course(p.course_id, auth.uid()) THEN RAISE EXCEPTION 'Only course stewards can review changes'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'Already reviewed'; END IF;
  IF NOT _approve THEN
    UPDATE course_change_proposals SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), review_note=_note WHERE id=_id;
    RETURN NULL;
  END IF;
  v := coalesce(_override, p.proposed_value);
  IF p.kind='add' THEN
    INSERT INTO course_features(course_id,layout_id,hole_number,type,geometry,label,layer,verification,created_by)
    VALUES (p.course_id, nullif(v->>'layout_id','')::uuid, nullif(v->>'hole_number','')::int,
      (v->>'type')::course_feature_type, v->'geometry', v->>'label', coalesce(v->>'layer','base'), 'STEWARD_VERIFIED', p.proposed_by)
    RETURNING id INTO fid;
  ELSIF p.kind='remove' THEN
    UPDATE course_features SET publish_state='archived' WHERE id=p.feature_id AND course_id=p.course_id; fid := p.feature_id;
  ELSE
    UPDATE course_features SET
      geometry = coalesce(v->'geometry', geometry),
      label = coalesce(v->>'label', label),
      verification='STEWARD_VERIFIED', updated_at=now()
    WHERE id=p.feature_id AND course_id=p.course_id; fid := p.feature_id;
  END IF;
  UPDATE course_change_proposals SET status='approved', reviewed_by=auth.uid(), reviewed_at=now(), review_note=_note, proposed_value=v WHERE id=_id;
  RETURN fid;
END $$;
REVOKE ALL ON FUNCTION public.review_course_proposal(uuid,boolean,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.review_course_proposal(uuid,boolean,jsonb,text) TO authenticated;

-- event overlays
CREATE TABLE public.course_event_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  layout_id uuid REFERENCES public.course_layouts(id) ON DELETE SET NULL,
  tournament_id uuid,
  league_event_id uuid,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_event_overlays TO authenticated;
GRANT ALL ON public.course_event_overlays TO service_role;
ALTER TABLE public.course_event_overlays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read overlays" ON public.course_event_overlays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Create own overlays" ON public.course_event_overlays FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Edit own overlays" ON public.course_event_overlays FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.can_steward_course(course_id, auth.uid()));
CREATE POLICY "Delete own overlays" ON public.course_event_overlays FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.can_steward_course(course_id, auth.uid()));
CREATE POLICY "Overlay owners insert event features" ON public.course_features FOR INSERT TO authenticated
  WITH CHECK (layer='event' AND created_by=auth.uid() AND EXISTS (SELECT 1 FROM course_event_overlays o WHERE o.id=event_overlay_id AND o.created_by=auth.uid()));
CREATE POLICY "Overlay owners edit event features" ON public.course_features FOR UPDATE TO authenticated
  USING (layer='event' AND EXISTS (SELECT 1 FROM course_event_overlays o WHERE o.id=event_overlay_id AND o.created_by=auth.uid()))
  WITH CHECK (layer='event');
CREATE POLICY "Overlay owners delete event features" ON public.course_features FOR DELETE TO authenticated
  USING (layer='event' AND EXISTS (SELECT 1 FROM course_event_overlays o WHERE o.id=event_overlay_id AND o.created_by=auth.uid()));

-- maintenance lifecycle
ALTER TABLE public.course_reports
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'REPORTED',
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS resolution_photo_url text,
  ADD COLUMN IF NOT EXISTS observed_on date,
  ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS feature_id uuid;
UPDATE public.course_reports SET lifecycle = CASE status::text WHEN 'confirmed' THEN 'CONFIRMED' WHEN 'resolved' THEN 'RESOLVED' WHEN 'expired' THEN 'DISMISSED' ELSE 'REPORTED' END;
ALTER TABLE public.course_reports ADD CONSTRAINT course_reports_lifecycle_chk
  CHECK (lifecycle IN ('REPORTED','CONFIRMED','PLANNED','IN_PROGRESS','RESOLVED','DISMISSED'));

CREATE TABLE public.course_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.course_reports(id) ON DELETE CASCADE,
  from_state text, to_state text NOT NULL,
  note text, photo_url text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.course_report_events(report_id, created_at);
GRANT SELECT ON public.course_report_events TO authenticated;
GRANT ALL ON public.course_report_events TO service_role;
ALTER TABLE public.course_report_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read report history" ON public.course_report_events FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_course_report_state(_report uuid, _state text, _note text DEFAULT NULL, _photo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r course_reports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO r FROM course_reports WHERE id=_report FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF _state NOT IN ('CONFIRMED','PLANNED','IN_PROGRESS','RESOLVED','DISMISSED') THEN RAISE EXCEPTION 'Unknown state'; END IF;
  IF _state IN ('PLANNED','IN_PROGRESS','DISMISSED') AND NOT can_steward_course(r.course_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only course stewards can do that';
  END IF;
  IF _state='RESOLVED' AND NOT (can_steward_course(r.course_id, auth.uid()) OR r.reporter_id=auth.uid()) THEN
    RAISE EXCEPTION 'Only stewards or the reporter can resolve this';
  END IF;
  UPDATE course_reports SET lifecycle=_state,
    status = CASE _state WHEN 'RESOLVED' THEN 'resolved'::course_report_status WHEN 'DISMISSED' THEN 'expired'::course_report_status WHEN 'CONFIRMED' THEN 'confirmed'::course_report_status ELSE status END,
    resolved_at = CASE WHEN _state='RESOLVED' THEN now() ELSE resolved_at END,
    resolution_photo_url = CASE WHEN _state='RESOLVED' THEN coalesce(_photo, resolution_photo_url) ELSE resolution_photo_url END,
    last_confirmed_at = CASE WHEN _state='CONFIRMED' THEN now() ELSE last_confirmed_at END,
    updated_at=now()
  WHERE id=_report;
  INSERT INTO course_report_events(report_id,from_state,to_state,note,photo_url,actor_id) VALUES (_report, r.lifecycle, _state, _note, _photo, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.set_course_report_state(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_course_report_state(uuid,text,text,text) TO authenticated;

CREATE POLICY "Stewards read all course reports" ON public.course_reports FOR SELECT TO authenticated USING (public.can_steward_course(course_id, auth.uid()));
