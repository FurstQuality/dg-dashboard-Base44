ALTER TABLE public.tracker_group_events
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS field_size integer,
  ADD COLUMN IF NOT EXISTS field_capacity integer,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS rounds_planned smallint,
  ADD COLUMN IF NOT EXISTS hydrated_at timestamptz;