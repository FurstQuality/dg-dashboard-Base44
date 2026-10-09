-- 1) tracker_event_rounds: one row per (tracked event, round)
CREATE TABLE public.tracker_event_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.tracker_group_events(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  round_label text,
  round_date date,
  course_name text,
  course_layout text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, round_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_event_rounds TO authenticated;
GRANT ALL ON public.tracker_event_rounds TO service_role;

ALTER TABLE public.tracker_event_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their tracker event rounds"
  ON public.tracker_event_rounds FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.tracker_group_events e
        JOIN public.tracker_groups g ON g.id = e.group_id
       WHERE e.id = tracker_event_rounds.event_id
         AND g.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.tracker_group_events e
        JOIN public.tracker_groups g ON g.id = e.group_id
       WHERE e.id = tracker_event_rounds.event_id
         AND g.owner_id = auth.uid()
    )
  );

CREATE TRIGGER trg_tracker_event_rounds_updated_at
  BEFORE UPDATE ON public.tracker_event_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tracker_event_rounds_event ON public.tracker_event_rounds(event_id, round_number);

-- 2) Extend tracker_tee_times for per-round data
ALTER TABLE public.tracker_tee_times
  ADD COLUMN IF NOT EXISTS round_number integer,
  ADD COLUMN IF NOT EXISTS pool text,
  ADD COLUMN IF NOT EXISTS starting_hole text;

-- Allow multiple rows per member per event (one per round); older schema had
-- a UNIQUE(event_id, member_id) constraint on some deployments — drop it if present.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.tracker_tee_times'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) ~* 'event_id, member_id'
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tracker_tee_times DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Fresh uniqueness: one row per (event, member, round). round_number NULL is
-- treated as its own slot for pre-draw entries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracker_tee_times_event_member_round
  ON public.tracker_tee_times (event_id, member_id, COALESCE(round_number, 0));

-- 3) Cache parsed schedule on the canonical event row
ALTER TABLE public.pdga_tour_events
  ADD COLUMN IF NOT EXISTS schedule_json jsonb;