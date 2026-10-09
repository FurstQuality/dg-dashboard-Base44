REVOKE SELECT ON public.lost_disc_reports FROM anon, authenticated;

GRANT SELECT (
  id, user_id, kind, mold_name, brand, color, weight_grams,
  ink_name, ink_pdga_number, course_id, hole_number, latitude, longitude,
  city, state, occurred_on, reward, handoff_notes, photo_url, status,
  reunited_at, created_at, updated_at
) ON public.lost_disc_reports TO anon, authenticated;