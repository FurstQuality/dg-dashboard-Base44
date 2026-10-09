UPDATE public.tracker_group_events AS e
SET location = v.loc,
    event_date = COALESCE(e.event_date, v.dt),
    last_synced_at = now()
FROM (VALUES
  ('98834','Normal, IL', DATE '2026-07-28'),
  ('98832','East Peoria, IL', DATE '2026-07-28'),
  ('98838','Hanna City, IL', DATE '2026-07-29'),
  ('98837','Pekin, IL', DATE '2026-07-29'),
  ('98836','Eureka, IL', DATE '2026-07-29'),
  ('98841','Pekin, IL', DATE '2026-07-30'),
  ('98842','Chillicothe, IL', DATE '2026-07-30'),
  ('98448','Eureka, IL', DATE '2026-07-31'),
  ('97343','Buffalo, NY', DATE '2026-08-11'),
  ('104011','Portage, IN', DATE '2026-08-22'),
  ('99789','Valparaiso, IN', DATE '2026-07-01'),
  ('104158','Portage, IN', DATE '2026-06-02')
) AS v(ref, loc, dt)
WHERE e.pdga_event_ref = v.ref;