DELETE FROM public.tracker_change_log
WHERE field = 'status' AND to_value = 'withdrawn'
  AND member_id IN (SELECT id FROM public.tracker_group_members WHERE pdga_number IN ('280905','271759'))
  AND event_id IN (SELECT id FROM public.tracker_group_events WHERE name ILIKE '%Ledgestone Open%');

UPDATE public.tracker_tee_times t SET status = 'scheduled'
WHERE t.status = 'withdrawn'
  AND t.member_id IN (SELECT id FROM public.tracker_group_members WHERE pdga_number IN ('280905','271759'))
  AND t.event_id IN (SELECT id FROM public.tracker_group_events WHERE name ILIKE '%Ledgestone Open%');