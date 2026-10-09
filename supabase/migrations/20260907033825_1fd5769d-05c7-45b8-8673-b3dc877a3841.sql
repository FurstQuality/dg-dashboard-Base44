ALTER TABLE public.play_availability DROP CONSTRAINT IF EXISTS play_availability_status_check;
ALTER TABLE public.play_availability ADD CONSTRAINT play_availability_status_check
  CHECK (status IN ('looking','maybe','not_looking','casual_round','league_round','tournament_round','practicing'));
ALTER TABLE public.play_availability ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT true;
ALTER TABLE public.play_availability ADD COLUMN IF NOT EXISTS auto_round_id uuid;