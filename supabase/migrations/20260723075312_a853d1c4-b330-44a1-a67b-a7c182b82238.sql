
CREATE TABLE IF NOT EXISTS public.tracker_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trip_start date,
  trip_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tracker_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.tracker_groups(id) ON DELETE CASCADE,
  pdga_number text NOT NULL,
  display_name text,
  default_division text,
  is_you boolean NOT NULL DEFAULT false,
  color text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, pdga_number)
);

CREATE TABLE IF NOT EXISTS public.tracker_group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.tracker_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_date date,
  location text,
  tier text,
  pdga_event_ref text,
  url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tracker_tee_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.tracker_group_events(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.tracker_group_members(id) ON DELETE CASCADE,
  division text,
  tee_time text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS tracker_groups_owner_idx ON public.tracker_groups(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracker_members_group_idx ON public.tracker_group_members(group_id);
CREATE INDEX IF NOT EXISTS tracker_events_group_idx ON public.tracker_group_events(group_id, event_date);
CREATE INDEX IF NOT EXISTS tracker_tee_times_event_idx ON public.tracker_tee_times(event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_group_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_tee_times TO authenticated;
GRANT ALL ON public.tracker_groups TO service_role;
GRANT ALL ON public.tracker_group_members TO service_role;
GRANT ALL ON public.tracker_group_events TO service_role;
GRANT ALL ON public.tracker_tee_times TO service_role;

ALTER TABLE public.tracker_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_group_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_tee_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages tracker_groups"
  ON public.tracker_groups FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner manages tracker_group_members"
  ON public.tracker_group_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tracker_groups g WHERE g.id = tracker_group_members.group_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_groups g WHERE g.id = tracker_group_members.group_id AND g.owner_id = auth.uid()));

CREATE POLICY "Owner manages tracker_group_events"
  ON public.tracker_group_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.tracker_groups g WHERE g.id = tracker_group_events.group_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tracker_groups g WHERE g.id = tracker_group_events.group_id AND g.owner_id = auth.uid()));

CREATE POLICY "Owner manages tracker_tee_times"
  ON public.tracker_tee_times FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.tracker_group_events e
    JOIN public.tracker_groups g ON g.id = e.group_id
    WHERE e.id = tracker_tee_times.event_id AND g.owner_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tracker_group_events e
    JOIN public.tracker_groups g ON g.id = e.group_id
    WHERE e.id = tracker_tee_times.event_id AND g.owner_id = auth.uid()));

CREATE TRIGGER trg_tracker_groups_updated_at
  BEFORE UPDATE ON public.tracker_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
