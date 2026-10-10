
-- roles
ALTER TABLE public.course_stewards DROP CONSTRAINT course_stewards_role_check;
ALTER TABLE public.course_stewards ADD CONSTRAINT course_stewards_role_check
  CHECK (role IN ('CONTRIBUTOR','TRUSTED_CONTRIBUTOR','STEWARD','COURSE_ADMIN'));

CREATE OR REPLACE FUNCTION public.is_course_admin(_course uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (public.has_role(_user,'admin') OR public.has_role(_user,'super_admin')
    OR EXISTS (SELECT 1 FROM course_stewards s WHERE s.course_id=_course AND s.user_id=_user AND s.role='COURSE_ADMIN'))
$$;
GRANT EXECUTE ON FUNCTION public.is_course_admin(uuid,uuid) TO authenticated;

-- proposals: more statuses, risk class, creator can withdraw
ALTER TABLE public.course_change_proposals DROP CONSTRAINT course_change_proposals_status_check;
ALTER TABLE public.course_change_proposals ADD CONSTRAINT course_change_proposals_status_check
  CHECK (status IN ('pending','approved','rejected','needs_more_info','withdrawn','conflict'));
ALTER TABLE public.course_change_proposals ADD COLUMN IF NOT EXISTS risk text NOT NULL DEFAULT 'HIGH'
  CHECK (risk IN ('HIGH','MEDIUM'));
ALTER TABLE public.course_change_proposals ADD COLUMN IF NOT EXISTS effective_from date;
GRANT UPDATE ON public.course_change_proposals TO authenticated;
CREATE POLICY "Withdraw own pending proposal" ON public.course_change_proposals FOR UPDATE TO authenticated
  USING (proposed_by = auth.uid() AND status IN ('pending','needs_more_info'))
  WITH CHECK (proposed_by = auth.uid() AND status IN ('pending','withdrawn') AND reviewed_by IS NULL);

-- condition category config (per-category windows, duplicate radius)
CREATE TABLE public.course_condition_categories (
  key text PRIMARY KEY,
  label text NOT NULL,
  recheck_days integer NOT NULL,
  stale_days integer NOT NULL,
  archive_days integer NOT NULL,
  duplicate_radius_ft integer NOT NULL DEFAULT 50,
  default_priority text NOT NULL DEFAULT 'MEDIUM',
  sort_order integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.course_condition_categories TO authenticated, anon;
GRANT ALL ON public.course_condition_categories TO service_role;
ALTER TABLE public.course_condition_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads categories" ON public.course_condition_categories FOR SELECT USING (true);
INSERT INTO public.course_condition_categories(key,label,recheck_days,stale_days,archive_days,duplicate_radius_ft,default_priority,sort_order) VALUES
 ('DOWNED_TREE','Tree or limb down',4,10,60,50,'MEDIUM',1),
 ('TRASH','Trash',2,5,20,40,'LOW',2),
 ('BASKET','Basket problem',10,30,120,30,'HIGH',3),
 ('TEE_PAD','Tee pad problem',10,30,120,30,'MEDIUM',4),
 ('SIGN','Sign missing or damaged',14,45,180,30,'LOW',5),
 ('PATH','Path blocked',4,10,60,50,'MEDIUM',6),
 ('FLOODING','Flooding or mud',1,3,14,80,'MEDIUM',7),
 ('VEHICLE','Vehicle or obstruction',1,3,14,50,'MEDIUM',8),
 ('RESTROOM','Restroom',7,21,90,40,'LOW',9),
 ('BRIDGE','Bridge',10,30,120,40,'HIGH',10),
 ('VANDALISM','Vandalism',10,30,120,40,'MEDIUM',11),
 ('CONSTRUCTION','Construction',21,60,240,80,'HIGH',12),
 ('SAFETY','Safety hazard',3,7,90,50,'SAFETY',13),
 ('OTHER','Something else',5,14,60,40,'LOW',14);

-- conditions (extends course_reports, one stable id per condition)
ALTER TABLE public.course_reports DROP CONSTRAINT course_reports_lifecycle_chk;
ALTER TABLE public.course_reports ADD CONSTRAINT course_reports_lifecycle_chk CHECK (lifecycle IN
 ('REPORTED','NEEDS_CONFIRMATION','CONFIRMED','PLANNED','IN_PROGRESS','POSSIBLY_RESOLVED','RESOLVED','DISMISSED','EXPIRED'));
ALTER TABLE public.course_reports
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS freshness_state text NOT NULL DEFAULT 'FRESH',
  ADD COLUMN IF NOT EXISTS dispute_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_from uuid,
  ADD COLUMN IF NOT EXISTS work_group text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
UPDATE public.course_reports SET priority = CASE lower(severity) WHEN 'low' THEN 'LOW' WHEN 'high' THEN 'HIGH' WHEN 'critical' THEN 'SAFETY' WHEN 'safety' THEN 'SAFETY' ELSE 'MEDIUM' END;
ALTER TABLE public.course_reports
  ADD CONSTRAINT course_reports_priority_chk CHECK (priority IN ('INFO','LOW','MEDIUM','HIGH','SAFETY')),
  ADD CONSTRAINT course_reports_conf_chk CHECK (confidence IN ('UNVERIFIED','COMMUNITY_CONFIRMED','STEWARD_VERIFIED','OFFICIAL')),
  ADD CONSTRAINT course_reports_fresh_chk CHECK (freshness_state IN ('FRESH','NEEDS_CONFIRMATION','STALE','ARCHIVED'));
CREATE INDEX IF NOT EXISTS course_reports_active_idx ON public.course_reports(course_id, lifecycle, freshness_state);

CREATE TABLE public.course_condition_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.course_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  response text NOT NULL CHECK (response IN ('STILL_THERE','RESOLVED','INCORRECT','NOT_SURE')),
  note text CHECK (note IS NULL OR length(note) <= 280),
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);
GRANT SELECT ON public.course_condition_responses TO authenticated;
GRANT ALL ON public.course_condition_responses TO service_role;
ALTER TABLE public.course_condition_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or steward responses" ON public.course_condition_responses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM course_reports r WHERE r.id=report_id AND public.can_steward_course(r.course_id, auth.uid())));

-- internal contributor trust (admin-only)
CREATE TABLE public.course_contributor_trust (
  user_id uuid PRIMARY KEY,
  accepted_reports integer NOT NULL DEFAULT 0,
  rejected_reports integer NOT NULL DEFAULT 0,
  accurate_responses integer NOT NULL DEFAULT 0,
  approved_proposals integer NOT NULL DEFAULT 0,
  rejected_proposals integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0.5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.course_contributor_trust TO authenticated;
GRANT ALL ON public.course_contributor_trust TO service_role;
ALTER TABLE public.course_contributor_trust ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read trust" ON public.course_contributor_trust FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.bump_course_trust(_user uuid, _field text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  INSERT INTO course_contributor_trust(user_id) VALUES (_user) ON CONFLICT DO NOTHING;
  EXECUTE format('UPDATE course_contributor_trust SET %I = %I + 1, updated_at = now() WHERE user_id = $1', _field, _field) USING _user;
  UPDATE course_contributor_trust SET score =
    round(((accepted_reports + accurate_responses + 2*approved_proposals + 1)::numeric /
      (accepted_reports + accurate_responses + 2*approved_proposals + rejected_reports + 2*rejected_proposals + 2)), 3)
  WHERE user_id = _user;
END $$;
REVOKE ALL ON FUNCTION public.bump_course_trust(uuid,text) FROM public, anon, authenticated;

-- course + hole status
CREATE TABLE public.course_status (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('OPEN','OPEN_WITH_CONDITIONS','PARTIALLY_CLOSED','CLOSED','UNKNOWN')),
  note text,
  authority text NOT NULL DEFAULT 'STEWARD' CHECK (authority IN ('OFFICIAL','STEWARD')),
  verified_playable_at timestamptz,
  valid_until timestamptz,
  set_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  layout_verified_at timestamptz,
  conditions_checked_at timestamptz
);
GRANT SELECT ON public.course_status TO authenticated, anon;
GRANT ALL ON public.course_status TO service_role;
ALTER TABLE public.course_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads course status" ON public.course_status FOR SELECT USING (true);

CREATE TABLE public.course_hole_status (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','CAUTION','TEMPORARILY_CLOSED','UNDER_CONSTRUCTION','UNKNOWN')),
  note text,
  set_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, hole_number)
);
GRANT SELECT ON public.course_hole_status TO authenticated, anon;
GRANT ALL ON public.course_hole_status TO service_role;
ALTER TABLE public.course_hole_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads hole status" ON public.course_hole_status FOR SELECT USING (true);

CREATE TABLE public.course_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  hole_number integer,
  from_status text, to_status text NOT NULL, note text,
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.course_status_history TO authenticated;
GRANT ALL ON public.course_status_history TO service_role;
ALTER TABLE public.course_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read status history" ON public.course_status_history FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_course_status(_course uuid, _status text, _note text DEFAULT NULL, _hole integer DEFAULT NULL, _playable_days integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text; is_admin boolean := is_course_admin(_course, auth.uid());
BEGIN
  IF NOT can_steward_course(_course, auth.uid()) THEN RAISE EXCEPTION 'Only course stewards can set course status'; END IF;
  IF _hole IS NULL THEN
    IF _status NOT IN ('OPEN','OPEN_WITH_CONDITIONS','PARTIALLY_CLOSED','CLOSED','UNKNOWN') THEN RAISE EXCEPTION 'Unknown status'; END IF;
    SELECT status INTO prev FROM course_status WHERE course_id=_course;
    INSERT INTO course_status(course_id,status,note,authority,set_by,updated_at,verified_playable_at,valid_until)
    VALUES (_course,_status,_note,CASE WHEN is_admin THEN 'OFFICIAL' ELSE 'STEWARD' END,auth.uid(),now(),
      CASE WHEN _playable_days IS NOT NULL THEN now() END,
      CASE WHEN _playable_days IS NOT NULL THEN now() + make_interval(days => _playable_days) END)
    ON CONFLICT (course_id) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, authority=EXCLUDED.authority,
      set_by=EXCLUDED.set_by, updated_at=now(),
      verified_playable_at=coalesce(EXCLUDED.verified_playable_at, course_status.verified_playable_at),
      valid_until=coalesce(EXCLUDED.valid_until, course_status.valid_until);
  ELSE
    IF _status NOT IN ('OPEN','CAUTION','TEMPORARILY_CLOSED','UNDER_CONSTRUCTION','UNKNOWN') THEN RAISE EXCEPTION 'Unknown hole status'; END IF;
    SELECT status INTO prev FROM course_hole_status WHERE course_id=_course AND hole_number=_hole;
    INSERT INTO course_hole_status(course_id,hole_number,status,note,set_by) VALUES (_course,_hole,_status,_note,auth.uid())
    ON CONFLICT (course_id,hole_number) DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, set_by=EXCLUDED.set_by, updated_at=now();
  END IF;
  INSERT INTO course_status_history(course_id,hole_number,from_status,to_status,note,actor_id) VALUES (_course,_hole,prev,_status,_note,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.set_course_status(uuid,text,text,integer,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_course_status(uuid,text,text,integer,integer) TO authenticated;

-- community responses: one per user, reporter never counts, safety needs steward
CREATE OR REPLACE FUNCTION public.respond_course_condition(_report uuid, _response text, _note text DEFAULT NULL, _photo text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r course_reports; still int; res int; inc int; nxt text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF _response NOT IN ('STILL_THERE','RESOLVED','INCORRECT','NOT_SURE') THEN RAISE EXCEPTION 'Unknown response'; END IF;
  SELECT * INTO r FROM course_reports WHERE id=_report FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF r.lifecycle IN ('RESOLVED','DISMISSED','EXPIRED') THEN RAISE EXCEPTION 'This report is already closed'; END IF;
  IF r.reporter_id = auth.uid() AND _response <> 'RESOLVED' THEN
    -- reporter re-observing refreshes freshness but never counts as independent confirmation
    UPDATE course_reports SET last_observed_at=now(), freshness_state='FRESH', updated_at=now() WHERE id=_report;
    INSERT INTO course_report_events(report_id,from_state,to_state,note,photo_url,actor_id) VALUES (_report,r.lifecycle,r.lifecycle,coalesce(_note,'Reporter update'),_photo,auth.uid());
    RETURN r.lifecycle;
  END IF;
  INSERT INTO course_condition_responses(report_id,user_id,response,note,photo_url) VALUES (_report,auth.uid(),_response,_note,_photo)
  ON CONFLICT (report_id,user_id) DO UPDATE SET response=EXCLUDED.response, note=EXCLUDED.note, photo_url=coalesce(EXCLUDED.photo_url, course_condition_responses.photo_url), created_at=now();
  SELECT count(*) FILTER (WHERE response='STILL_THERE'), count(*) FILTER (WHERE response='RESOLVED'), count(*) FILTER (WHERE response='INCORRECT')
    INTO still, res, inc FROM course_condition_responses WHERE report_id=_report AND user_id <> r.reporter_id;
  nxt := r.lifecycle;
  IF _response='STILL_THERE' THEN
    IF r.lifecycle IN ('REPORTED','NEEDS_CONFIRMATION','POSSIBLY_RESOLVED') THEN nxt := 'CONFIRMED'; END IF;
  ELSIF _response='RESOLVED' AND r.priority <> 'SAFETY' AND res >= 2 AND res > still THEN
    nxt := 'POSSIBLY_RESOLVED';
  END IF;
  UPDATE course_reports SET
    lifecycle = nxt,
    confirm_count = still, resolved_count = res, dispute_count = inc,
    confidence = CASE WHEN confidence IN ('STEWARD_VERIFIED','OFFICIAL') THEN confidence WHEN still >= 1 THEN 'COMMUNITY_CONFIRMED' ELSE confidence END,
    last_confirmed_at = CASE WHEN _response='STILL_THERE' THEN now() ELSE last_confirmed_at END,
    last_observed_at = CASE WHEN _response IN ('STILL_THERE','RESOLVED') THEN now() ELSE last_observed_at END,
    freshness_state = CASE WHEN _response='STILL_THERE' THEN 'FRESH' ELSE freshness_state END,
    updated_at = now()
  WHERE id=_report;
  INSERT INTO course_report_events(report_id,from_state,to_state,note,photo_url,actor_id) VALUES (_report,r.lifecycle,nxt,coalesce(_note, 'Response: '||_response),_photo,auth.uid());
  UPDATE course_status SET conditions_checked_at=now() WHERE course_id=r.course_id;
  RETURN nxt;
END $$;
REVOKE ALL ON FUNCTION public.respond_course_condition(uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_course_condition(uuid,text,text,text) TO authenticated;

-- steward state changes (replace): verify, reopen, priority correction, trust credit
CREATE OR REPLACE FUNCTION public.set_course_report_state(_report uuid, _state text, _note text DEFAULT NULL, _photo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r course_reports; steward boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO r FROM course_reports WHERE id=_report FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  steward := can_steward_course(r.course_id, auth.uid());
  IF _state NOT IN ('CONFIRMED','PLANNED','IN_PROGRESS','RESOLVED','DISMISSED','REPORTED') THEN RAISE EXCEPTION 'Unknown state'; END IF;
  IF _state IN ('CONFIRMED','PLANNED','IN_PROGRESS','DISMISSED') AND NOT steward THEN RAISE EXCEPTION 'Only course stewards can do that'; END IF;
  IF _state='RESOLVED' AND NOT (steward OR (r.reporter_id=auth.uid() AND r.priority <> 'SAFETY')) THEN
    RAISE EXCEPTION 'Only a course steward can resolve this';
  END IF;
  IF _state='REPORTED' AND r.lifecycle NOT IN ('RESOLVED','POSSIBLY_RESOLVED','EXPIRED') THEN RAISE EXCEPTION 'Only closed reports can be reopened'; END IF;
  UPDATE course_reports SET lifecycle=_state,
    status = CASE _state WHEN 'RESOLVED' THEN 'resolved'::course_report_status WHEN 'DISMISSED' THEN 'expired'::course_report_status WHEN 'REPORTED' THEN 'open'::course_report_status ELSE 'confirmed'::course_report_status END,
    confidence = CASE WHEN steward AND _state IN ('CONFIRMED','PLANNED','IN_PROGRESS') THEN CASE WHEN is_course_admin(r.course_id, auth.uid()) THEN 'OFFICIAL' ELSE 'STEWARD_VERIFIED' END ELSE confidence END,
    resolved_at = CASE WHEN _state='RESOLVED' THEN now() WHEN _state='REPORTED' THEN NULL ELSE resolved_at END,
    resolution_photo_url = CASE WHEN _state='RESOLVED' THEN coalesce(_photo, resolution_photo_url) ELSE resolution_photo_url END,
    last_confirmed_at = CASE WHEN _state IN ('CONFIRMED','REPORTED') THEN now() ELSE last_confirmed_at END,
    freshness_state = CASE WHEN _state IN ('CONFIRMED','REPORTED') THEN 'FRESH' ELSE freshness_state END,
    expires_at = CASE WHEN _state='REPORTED' THEN now() + interval '45 days' ELSE expires_at END,
    archived_at = CASE WHEN _state='REPORTED' THEN NULL ELSE archived_at END,
    updated_at=now()
  WHERE id=_report;
  INSERT INTO course_report_events(report_id,from_state,to_state,note,photo_url,actor_id)
    VALUES (_report, r.lifecycle, CASE WHEN _state='REPORTED' THEN 'REOPENED' ELSE _state END, _note, _photo, auth.uid());
  IF steward AND _state IN ('CONFIRMED','RESOLVED') AND r.lifecycle IN ('REPORTED','NEEDS_CONFIRMATION','CONFIRMED') THEN
    PERFORM bump_course_trust(r.reporter_id, 'accepted_reports');
  ELSIF steward AND _state='DISMISSED' THEN
    PERFORM bump_course_trust(r.reporter_id, 'rejected_reports');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_course_report_priority(_report uuid, _priority text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r course_reports;
BEGIN
  SELECT * INTO r FROM course_reports WHERE id=_report;
  IF r.id IS NULL OR NOT can_steward_course(r.course_id, auth.uid()) THEN RAISE EXCEPTION 'Only course stewards can change priority'; END IF;
  IF _priority NOT IN ('INFO','LOW','MEDIUM','HIGH','SAFETY') THEN RAISE EXCEPTION 'Unknown priority'; END IF;
  UPDATE course_reports SET priority=_priority, updated_at=now() WHERE id=_report;
  INSERT INTO course_report_events(report_id,from_state,to_state,note,actor_id) VALUES (_report,r.lifecycle,r.lifecycle,'Priority set to '||_priority,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.set_course_report_priority(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_course_report_priority(uuid,text) TO authenticated;

-- proposal approval credits trust
CREATE OR REPLACE FUNCTION public.course_proposal_trust()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status='approved' AND OLD.status<>'approved' THEN PERFORM bump_course_trust(NEW.proposed_by,'approved_proposals');
  ELSIF NEW.status='rejected' AND OLD.status<>'rejected' THEN PERFORM bump_course_trust(NEW.proposed_by,'rejected_proposals'); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER course_proposal_trust AFTER UPDATE OF status ON public.course_change_proposals FOR EACH ROW EXECUTE FUNCTION public.course_proposal_trust();

-- server-side scheduler: fresh -> needs confirmation -> stale -> archived (never deleted)
CREATE OR REPLACE FUNCTION public.course_conditions_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; m integer;
BEGIN
  WITH c AS (
    SELECT r.id, r.lifecycle, coalesce(r.last_confirmed_at, r.last_observed_at, r.created_at) AS seen,
      coalesce(k.recheck_days,5) rd, coalesce(k.stale_days,14) sd, coalesce(k.archive_days,60) ad
    FROM course_reports r LEFT JOIN course_condition_categories k ON k.key = r.category
    WHERE r.archived_at IS NULL
  )
  UPDATE course_reports r SET
    freshness_state = CASE
      WHEN r.lifecycle IN ('RESOLVED','DISMISSED','EXPIRED') AND now() - coalesce(r.resolved_at, r.updated_at) > interval '30 days' THEN 'ARCHIVED'
      WHEN r.lifecycle IN ('RESOLVED','DISMISSED','EXPIRED') THEN r.freshness_state
      WHEN r.priority <> 'SAFETY' AND now() - c.seen > make_interval(days => c.ad) THEN 'ARCHIVED'
      WHEN now() - c.seen > make_interval(days => c.sd) THEN 'STALE'
      WHEN now() - c.seen > make_interval(days => c.rd) THEN 'NEEDS_CONFIRMATION'
      ELSE 'FRESH' END,
    lifecycle = CASE
      WHEN r.lifecycle IN ('RESOLVED','DISMISSED','EXPIRED','PLANNED','IN_PROGRESS') THEN r.lifecycle
      WHEN r.priority <> 'SAFETY' AND now() - c.seen > make_interval(days => c.ad) THEN 'EXPIRED'
      WHEN now() - c.seen > make_interval(days => c.rd) THEN 'NEEDS_CONFIRMATION'
      ELSE r.lifecycle END,
    updated_at = now()
  FROM c WHERE c.id = r.id AND (
    r.freshness_state IS DISTINCT FROM (CASE
      WHEN r.lifecycle IN ('RESOLVED','DISMISSED','EXPIRED') AND now() - coalesce(r.resolved_at, r.updated_at) > interval '30 days' THEN 'ARCHIVED'
      WHEN r.lifecycle IN ('RESOLVED','DISMISSED','EXPIRED') THEN r.freshness_state
      WHEN r.priority <> 'SAFETY' AND now() - c.seen > make_interval(days => c.ad) THEN 'ARCHIVED'
      WHEN now() - c.seen > make_interval(days => c.sd) THEN 'STALE'
      WHEN now() - c.seen > make_interval(days => c.rd) THEN 'NEEDS_CONFIRMATION'
      ELSE 'FRESH' END));
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE course_reports SET archived_at = now() WHERE freshness_state='ARCHIVED' AND archived_at IS NULL;
  GET DIAGNOSTICS m = ROW_COUNT;
  INSERT INTO course_report_events(report_id,from_state,to_state,note)
    SELECT id, lifecycle, lifecycle, 'Archived after no recent confirmation' FROM course_reports WHERE archived_at > now() - interval '1 minute';
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.course_conditions_tick() FROM public, anon, authenticated;
SELECT cron.schedule('course-conditions-tick', '17 * * * *', 'SELECT public.course_conditions_tick()');
