ALTER TABLE public.tournament_rounds ADD COLUMN IF NOT EXISTS layout_version_id uuid REFERENCES public.layout_versions(id) ON DELETE SET NULL;
ALTER TABLE public.league_events ADD COLUMN IF NOT EXISTS layout_version_id uuid REFERENCES public.layout_versions(id) ON DELETE SET NULL;
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS event_snapshot jsonb;
ALTER TABLE public.canonical_rounds ADD COLUMN IF NOT EXISTS event_kind text, ADD COLUMN IF NOT EXISTS event_id uuid, ADD COLUMN IF NOT EXISTS event_name text, ADD COLUMN IF NOT EXISTS event_round_number int;
CREATE INDEX IF NOT EXISTS canonical_rounds_event_idx ON public.canonical_rounds(event_kind, event_id);

CREATE OR REPLACE FUNCTION public.latest_layout_version(_layout uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.layout_versions WHERE layout_id = _layout ORDER BY version DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pin_event_layout_version()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.layout_id IS NULL THEN
    NEW.layout_version_id := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.layout_id IS DISTINCT FROM OLD.layout_id OR NEW.layout_version_id IS NULL THEN
    IF TG_OP = 'UPDATE' AND NEW.layout_id IS NOT DISTINCT FROM OLD.layout_id AND NEW.layout_version_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    IF NEW.layout_version_id IS NULL OR (TG_OP='UPDATE' AND NEW.layout_id IS DISTINCT FROM OLD.layout_id) THEN
      NEW.layout_version_id := public.latest_layout_version(NEW.layout_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pin_layout_version_tr ON public.tournament_rounds;
CREATE TRIGGER pin_layout_version_tr BEFORE INSERT OR UPDATE OF layout_id, layout_version_id ON public.tournament_rounds
  FOR EACH ROW EXECUTE FUNCTION public.pin_event_layout_version();
DROP TRIGGER IF EXISTS pin_layout_version_le ON public.league_events;
CREATE TRIGGER pin_layout_version_le BEFORE INSERT OR UPDATE OF layout_id, layout_version_id ON public.league_events
  FOR EACH ROW EXECUTE FUNCTION public.pin_event_layout_version();

UPDATE public.tournament_rounds SET layout_version_id = public.latest_layout_version(layout_id) WHERE layout_id IS NOT NULL AND layout_version_id IS NULL;
UPDATE public.league_events SET layout_version_id = public.latest_layout_version(layout_id) WHERE layout_id IS NOT NULL AND layout_version_id IS NULL;

-- Freeze layout version + event-only map rules for an event round/night.
CREATE OR REPLACE FUNCTION public.build_event_round_snapshot(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_event uuid; v_layout uuid; v_ver uuid; v_course uuid; v_snap jsonb; v_rules jsonb;
BEGIN
  IF _kind = 'tournament' THEN
    SELECT tournament_id, layout_id, layout_version_id, course_id INTO v_event, v_layout, v_ver, v_course FROM tournament_rounds WHERE id = _id;
  ELSIF _kind = 'league' THEN
    SELECT league_id, layout_id, layout_version_id, course_id INTO v_event, v_layout, v_ver, v_course FROM league_events WHERE id = _id;
  ELSE RAISE EXCEPTION 'Unknown event kind'; END IF;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event round not found'; END IF;
  IF NOT public.can_manage_event(_kind, v_event, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v_ver IS NULL AND v_layout IS NOT NULL THEN v_ver := public.latest_layout_version(v_layout); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'type',f.type,'hole_number',f.hole_number,'hole_numbers',f.hole_numbers,
           'geometry',f.geometry,'ob_side',f.ob_side,'label',f.label,'notes',f.notes)), '[]'::jsonb)
    INTO v_rules
    FROM course_features f JOIN course_event_overlays o ON o.id = f.event_overlay_id
   WHERE f.layer = 'event'
     AND ((_kind='tournament' AND o.tournament_id = v_event) OR (_kind='league' AND o.league_event_id = _id));

  v_snap := jsonb_build_object(
    'captured_at', now(), 'course_id', v_course, 'layout_id', v_layout, 'layout_version_id', v_ver,
    'layout_version', (SELECT version FROM layout_versions WHERE id = v_ver),
    'layout', (SELECT snapshot FROM layout_versions WHERE id = v_ver),
    'event_rules', v_rules);

  IF _kind = 'tournament' THEN
    UPDATE tournament_rounds SET rules_snapshot = v_snap, layout_version_id = v_ver WHERE id = _id;
  ELSE
    UPDATE league_events SET rules_snapshot = v_snap, layout_version_id = v_ver WHERE id = _id;
  END IF;
  RETURN v_snap;
END $$;
REVOKE ALL ON FUNCTION public.build_event_round_snapshot(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.build_event_round_snapshot(text, uuid) TO authenticated;

-- Copy the event snapshot onto a scored round when it is linked to an event round.
CREATE OR REPLACE FUNCTION public.attach_round_event_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.event_snapshot IS NULL THEN
    IF NEW.tournament_round_id IS NOT NULL THEN
      SELECT rules_snapshot INTO NEW.event_snapshot FROM tournament_rounds WHERE id = NEW.tournament_round_id;
    ELSIF NEW.league_event_id IS NOT NULL THEN
      SELECT rules_snapshot INTO NEW.event_snapshot FROM league_events WHERE id = NEW.league_event_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS attach_round_event_snapshot_tr ON public.rounds;
CREATE TRIGGER attach_round_event_snapshot_tr BEFORE INSERT OR UPDATE OF tournament_round_id, league_event_id, status ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.attach_round_event_snapshot();

-- Label canonical rounds with the event they came from.
CREATE OR REPLACE FUNCTION public.label_canonical_round_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.source_table <> 'round_ratings' THEN RETURN NULL; END IF;
  SELECT ro.tournament_id, ro.league_event_id, tr.round_number AS trn, t.name AS tname, le.league_id, le.week_number, l.name AS lname
    INTO r
    FROM round_ratings rr JOIN rounds ro ON ro.id = rr.round_id
    LEFT JOIN tournament_rounds tr ON tr.id = ro.tournament_round_id
    LEFT JOIN tournaments t ON t.id = ro.tournament_id
    LEFT JOIN league_events le ON le.id = ro.league_event_id
    LEFT JOIN leagues l ON l.id = le.league_id
   WHERE rr.id = NEW.source_row_id;
  IF r.tournament_id IS NOT NULL THEN
    UPDATE canonical_rounds SET event_kind='tournament', event_id=r.tournament_id, event_name=r.tname, event_round_number=r.trn
     WHERE id = NEW.canonical_round_id AND event_id IS NULL;
  ELSIF r.league_id IS NOT NULL THEN
    UPDATE canonical_rounds SET event_kind='league', event_id=r.league_id, event_name=r.lname, event_round_number=r.week_number
     WHERE id = NEW.canonical_round_id AND event_id IS NULL;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS label_canonical_round_event_tr ON public.canonical_round_sources;
CREATE TRIGGER label_canonical_round_event_tr AFTER INSERT ON public.canonical_round_sources
  FOR EACH ROW EXECUTE FUNCTION public.label_canonical_round_event();