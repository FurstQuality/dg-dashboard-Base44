CREATE TABLE public.event_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('announcement','delay','course_issue')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text CHECK (body IS NULL OR char_length(body) <= 1000),
  hole_number int CHECK (hole_number IS NULL OR hole_number BETWEEN 1 AND 99),
  delay_minutes int CHECK (delay_minutes IS NULL OR delay_minutes BETWEEN 1 AND 600),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX event_alerts_tournament_idx ON public.event_alerts (tournament_id, created_at DESC);
GRANT SELECT ON public.event_alerts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_alerts TO authenticated;
GRANT ALL ON public.event_alerts TO service_role;
ALTER TABLE public.event_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alerts visible on published events" ON public.event_alerts FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.status <> 'draft'::tournament_status)
         OR public.can_manage_event('tournament', tournament_id, auth.uid()));
CREATE POLICY "Event team posts alerts" ON public.event_alerts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_event('tournament', tournament_id, auth.uid()));
CREATE POLICY "Event team updates alerts" ON public.event_alerts FOR UPDATE TO authenticated
  USING (public.can_manage_event('tournament', tournament_id, auth.uid()))
  WITH CHECK (public.can_manage_event('tournament', tournament_id, auth.uid()));
CREATE POLICY "Event team deletes alerts" ON public.event_alerts FOR DELETE TO authenticated
  USING (public.can_manage_event('tournament', tournament_id, auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_alerts;

CREATE TABLE public.event_volunteer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  hole_number int CHECK (hole_number IS NULL OR hole_number BETWEEN 1 AND 99),
  assigned_to uuid,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX event_volunteer_tasks_t_idx ON public.event_volunteer_tasks (tournament_id);
CREATE INDEX event_volunteer_tasks_a_idx ON public.event_volunteer_tasks (assigned_to);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_volunteer_tasks TO authenticated;
GRANT ALL ON public.event_volunteer_tasks TO service_role;
ALTER TABLE public.event_volunteer_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team or assignee reads tasks" ON public.event_volunteer_tasks FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR public.can_manage_event('tournament', tournament_id, auth.uid()));
CREATE POLICY "Team creates tasks" ON public.event_volunteer_tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_event('tournament', tournament_id, auth.uid()));
CREATE POLICY "Team or assignee updates tasks" ON public.event_volunteer_tasks FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.can_manage_event('tournament', tournament_id, auth.uid()))
  WITH CHECK (assigned_to = auth.uid() OR public.can_manage_event('tournament', tournament_id, auth.uid()));
CREATE POLICY "Team deletes tasks" ON public.event_volunteer_tasks FOR DELETE TO authenticated
  USING (public.can_manage_event('tournament', tournament_id, auth.uid()));

-- Assignees who are not on the event team may only move their task's status.
CREATE OR REPLACE FUNCTION public.guard_volunteer_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'done' AND OLD.status <> 'done' THEN NEW.completed_at := now();
  ELSIF NEW.status <> 'done' THEN NEW.completed_at := NULL; END IF;
  IF NOT public.can_manage_event('tournament', OLD.tournament_id, auth.uid()) THEN
    IF NEW.tournament_id <> OLD.tournament_id OR NEW.title <> OLD.title
       OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.hole_number IS DISTINCT FROM OLD.hole_number
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.due_at IS DISTINCT FROM OLD.due_at
       OR NEW.created_by <> OLD.created_by THEN
      RAISE EXCEPTION 'Volunteers can only update task status';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_volunteer_task_update BEFORE UPDATE ON public.event_volunteer_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_volunteer_task_update();
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_volunteer_tasks;