with split as (
  select event_id, round_number
  from tracker_event_rounds
  where course_name is not null
  group by event_id, round_number
  having count(distinct lower(btrim(course_name))) > 1
)
update tracker_event_rounds r
set course_name = null, course_layout = null, updated_at = now()
from split s
where r.event_id = s.event_id
  and r.round_number = s.round_number
  and r.pool is null
  and r.course_name is not null;