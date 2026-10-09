
-- Restore deleted holes 11-15 on layout b5b97235-5af2-4e99-9c2d-f0f4406c5fcd
-- Shift current holes 14..22 up by 5 (temporarily add 100 to avoid unique conflict), then insert 5 blank holes at positions 14-18 labelled 11-15.
UPDATE public.holes SET number = number + 100
  WHERE layout_id='b5b97235-5af2-4e99-9c2d-f0f4406c5fcd' AND number >= 14;

UPDATE public.holes SET number = number - 100 + 5
  WHERE layout_id='b5b97235-5af2-4e99-9c2d-f0f4406c5fcd' AND number >= 114;

INSERT INTO public.holes (layout_id, number, par, tee_name, basket_name, tee_color, basket_color, nickname, hazards, flight_path)
VALUES
  ('b5b97235-5af2-4e99-9c2d-f0f4406c5fcd', 14, 3, 'Main', 'A', '#ffffff', '#a3e635', '11', '{}'::text[], '[]'::jsonb),
  ('b5b97235-5af2-4e99-9c2d-f0f4406c5fcd', 15, 3, 'Main', 'A', '#ffffff', '#a3e635', '12', '{}'::text[], '[]'::jsonb),
  ('b5b97235-5af2-4e99-9c2d-f0f4406c5fcd', 16, 3, 'Main', 'A', '#ffffff', '#a3e635', '13', '{}'::text[], '[]'::jsonb),
  ('b5b97235-5af2-4e99-9c2d-f0f4406c5fcd', 17, 3, 'Main', 'A', '#ffffff', '#a3e635', '14', '{}'::text[], '[]'::jsonb),
  ('b5b97235-5af2-4e99-9c2d-f0f4406c5fcd', 18, 3, 'Main', 'A', '#ffffff', '#a3e635', '15', '{}'::text[], '[]'::jsonb);

UPDATE public.course_layouts SET hole_count = 27 WHERE id='b5b97235-5af2-4e99-9c2d-f0f4406c5fcd';
