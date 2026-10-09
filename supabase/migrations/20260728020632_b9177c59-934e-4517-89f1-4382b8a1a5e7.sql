UPDATE public.scheduled_events
   SET starts_on = DATE '2026-06-02', ends_on = DATE '2026-08-04'
 WHERE id = '91e0bdf9-cf88-4eec-b724-00d41a6780a9'
   AND starts_on IS NULL;

UPDATE public.scheduled_events
   SET starts_on = DATE '2026-07-01', ends_on = DATE '2026-09-02'
 WHERE id = '1d88bfdf-379e-4738-99ec-ac89cdb270b7'
   AND starts_on IS NULL;