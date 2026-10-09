-- 1. blank tee times become unknown
UPDATE public.tracker_tee_times SET tee_time = NULL WHERE btrim(coalesce(tee_time,'')) = '';

-- 2. canonicalize 12-hour text ("3:40 pm") to 24-hour "HH:MM:SS"
UPDATE public.tracker_tee_times
SET tee_time = to_char(to_timestamp(btrim(tee_time), 'HH12:MI AM'), 'HH24:MI:SS')
WHERE tee_time ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$';

-- pad bare "9:05" / "09:05" to HH:MM:SS
UPDATE public.tracker_tee_times
SET tee_time = to_char(to_timestamp(btrim(tee_time), 'HH24:MI'), 'HH24:MI:SS')
WHERE tee_time ~ '^\s*\d{1,2}:\d{2}\s*$';

-- 3. carry division/notes from legacy round-less rows onto the real round rows
UPDATE public.tracker_tee_times r
SET division = COALESCE(r.division, l.division),
    notes    = COALESCE(r.notes, l.notes)
FROM public.tracker_tee_times l
WHERE l.round_number IS NULL
  AND r.round_number IS NOT NULL
  AND l.event_id = r.event_id
  AND l.member_id = r.member_id
  AND (r.division IS NULL OR r.notes IS NULL);

-- 4. drop the superseded legacy rows
DELETE FROM public.tracker_tee_times a
WHERE a.round_number IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tracker_tee_times b
    WHERE b.event_id = a.event_id AND b.member_id = a.member_id AND b.round_number IS NOT NULL
  );

-- 5. remove empty placeholder round rows with no course when pool rows exist
DELETE FROM public.tracker_event_rounds a
WHERE coalesce(a.course_name,'') = ''
  AND a.division IS NULL AND a.pool IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tracker_event_rounds b
    WHERE b.event_id = a.event_id AND b.round_number = a.round_number AND coalesce(b.course_name,'') <> ''
  );