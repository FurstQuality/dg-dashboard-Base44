insert into public.tracker_event_rounds (event_id, round_number, division, round_date, round_label)
select '01d0057d-c61b-4c8d-a92a-ab687fddeb1a'::uuid, v.n, null, v.d::date, 'Round ' || v.n
from (values (1,'2026-07-31'),(2,'2026-08-01'),(3,'2026-08-02')) as v(n,d)
on conflict (event_id, round_number, division) do update set round_date = excluded.round_date, round_label = coalesce(public.tracker_event_rounds.round_label, excluded.round_label);