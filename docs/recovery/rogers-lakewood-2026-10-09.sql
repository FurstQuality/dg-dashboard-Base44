-- Rogers Lakewood recovery, prepared 2026-10-09.
-- Run ONLY on Supabase project ypeebzwggcsyfvafpifa after reviewing.
-- Restores the 18-hole Blue Tees layout and 27-hole physical course count.
-- Preserves every row: the 27 accidental blank rows move into a draft layout.
-- Does NOT recreate missing red tees or extra baskets; those require a backup.
-- Any mismatch raises an error and rolls back the entire transaction.
BEGIN;
CREATE TEMP TABLE rogers_expected (id uuid PRIMARY KEY, old_number integer) ON COMMIT DROP;
INSERT INTO rogers_expected VALUES
  ('9f240eb5-08dd-4733-a29a-4bc036ad3cbc'::uuid, -1000018),
  ('74f4e365-e415-46fd-965a-75c88dfde70a'::uuid, -1000017),
  ('4b4e8940-fe1a-435e-8219-0ee65bdd9bde'::uuid, -1000016),
  ('971745e5-9580-4911-bee6-83e12b05d6cc'::uuid, -1000015),
  ('f51a31aa-b180-46df-9a9b-652f2f585faa'::uuid, -1000014),
  ('307cc6e7-0aae-4ad5-a804-3894881f32fd'::uuid, -1000013),
  ('8ab6271f-98d4-43bb-bf27-e67c73bcc8aa'::uuid, -1000012),
  ('c8ed3f44-1818-457c-85d6-0341e0671f2d'::uuid, -1000011),
  ('7f76a4f4-064b-4a8c-8f09-5a7bfdbaa91c'::uuid, -1000010),
  ('315a2c51-8327-4bf1-99c6-2d0ba5d47a8b'::uuid, -1000009),
  ('f13a7494-20d5-4f06-836a-6af71a1fc543'::uuid, -1000008),
  ('4676d91e-6785-47aa-bdd9-4ff0160a7b9e'::uuid, -1000007),
  ('551e9e7a-b2b7-4539-b465-683095c4141a'::uuid, -1000006),
  ('f1d6c2fa-34c9-40d4-892a-18aa43105f40'::uuid, -1000005),
  ('8a773a94-6d60-43b4-beb1-3ef75864da1d'::uuid, -1000004),
  ('47ffb161-4759-4213-b4e8-369ce09f328e'::uuid, -1000003),
  ('471a997d-dd73-4c27-9910-b679400af03e'::uuid, -1000002),
  ('234de2f3-c3f1-4f4e-b542-24be2b25112c'::uuid, -1000001),
  ('e6112cfc-31a5-4ae6-b0f6-05a7ff62cd4d'::uuid, 1),
  ('bc640862-ef8b-427e-994a-d25c0eb695d7'::uuid, 2),
  ('8c142268-f4ab-4e3e-bfcf-00ebebc312fb'::uuid, 3),
  ('7d0f5761-9fb7-4a15-9d50-5aef2c2f5ac8'::uuid, 4),
  ('00bd6e12-d9a1-45de-a392-eb6e06587339'::uuid, 5),
  ('4956540d-08a9-4b15-9366-d302d186be93'::uuid, 6),
  ('4c15c2e3-5664-4e6b-aac5-cf0379746c60'::uuid, 7),
  ('73f8a029-c548-4995-9290-fc04b93c59f5'::uuid, 8),
  ('ecf751a5-9c46-4dd7-938e-d2c6cf3fa0b9'::uuid, 9),
  ('e6794381-68c4-4b73-a27b-0d88ae24ae23'::uuid, 10),
  ('fd7c4f60-f909-419d-b943-980d6df93f2a'::uuid, 11),
  ('e8db79ad-fdc3-46fe-a747-5d8ce5936144'::uuid, 12),
  ('785aa0a4-fb36-4cf2-bf57-acabc12cec77'::uuid, 13),
  ('1fc753ae-1cf5-4c68-a400-02871ddc425e'::uuid, 14),
  ('e7560dce-4d70-48f4-9121-2bfe6ec67f65'::uuid, 15),
  ('c83a6f96-1089-442f-a0fd-179f87510bf2'::uuid, 16),
  ('8fe0f760-7d7e-49fc-aa47-d055ea12f8b2'::uuid, 17),
  ('069f5a2e-d8e5-4f5c-95ac-197f98fa6955'::uuid, 18),
  ('4e4ce96e-f2fe-4285-9476-24940558b0a7'::uuid, 19),
  ('c7d2064b-dcb4-492f-a100-cbde37b997cd'::uuid, 20),
  ('51ca0276-a87a-4c10-8bc4-3edfe5ad7f63'::uuid, 21),
  ('24178a53-706f-4025-8267-b4ae170cb3a2'::uuid, 22),
  ('2f7d4c1f-5a8f-4ed0-a97e-89c97b375d38'::uuid, 23),
  ('673c055c-137d-4648-a530-29e3772a42a4'::uuid, 24),
  ('f65cda00-0836-4241-a2fa-5d71760df1ed'::uuid, 25),
  ('06088d1f-373a-4a38-9e60-a45731781862'::uuid, 26),
  ('d39580c1-eec7-45ad-b51a-5cef100cc54c'::uuid, 27);
DO $recovery$
DECLARE
  affected_layout constant uuid := '299cabbe-d369-4313-9642-08e07571f1e9';
  affected_course constant uuid := 'a7067be0-3faf-40a9-9a6e-e3f90fcd53dd';
  recovery_layout uuid := gen_random_uuid();
BEGIN
  PERFORM 1 FROM public.courses WHERE id = affected_course FOR UPDATE;
  PERFORM 1 FROM public.course_layouts WHERE id = affected_layout AND course_id = affected_course FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Course/layout identity mismatch; no changes applied'; END IF;
  PERFORM 1 FROM public.holes WHERE layout_id = affected_layout FOR UPDATE;
  IF (SELECT count(*) FROM public.holes WHERE layout_id = affected_layout) <> 45
    OR (SELECT count(*) FROM public.holes h JOIN rogers_expected e ON e.id = h.id
        WHERE h.layout_id = affected_layout AND h.number = e.old_number) <> 45 THEN
    RAISE EXCEPTION 'The layout has changed since the recovery snapshot. Review it again before recovery.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.holes h JOIN rogers_expected e ON e.id = h.id
    WHERE e.old_number > 0 AND (
      h.tee_lat IS NOT NULL OR h.tee_lng IS NOT NULL OR h.basket_lat IS NOT NULL OR h.basket_lng IS NOT NULL
      OR h.distance_ft IS NOT NULL OR coalesce(h.flight_path::text, '[]') <> '[]'
      OR nullif(h.nickname, '') IS NOT NULL OR nullif(h.caddy_notes, '') IS NOT NULL
      OR nullif(h.designer_notes, '') IS NOT NULL OR h.map_snapshot_path IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.hole_tees t WHERE t.hole_id = h.id)
      OR EXISTS (SELECT 1 FROM public.hole_baskets b WHERE b.hole_id = h.id)
    )
  ) THEN RAISE EXCEPTION 'A blank row now contains course work. Stop and review; nothing changed.'; END IF;

  INSERT INTO public.course_layouts (id, course_id, name, hole_count, par_total, is_default, status, description)
  VALUES (recovery_layout, affected_course, 'Recovery archive — accidental blank rows (2026-10-09)', 27, 81, false, 'draft',
    'Retained from interrupted Course Studio save. Original row IDs and all dependent records are preserved. These blank rows are not the mapped course.');

  UPDATE public.holes h SET layout_id = recovery_layout
  FROM rogers_expected e WHERE h.id = e.id AND e.old_number > 0;

  UPDATE public.holes h SET number = -1000000 - e.old_number
  FROM rogers_expected e WHERE h.id = e.id AND e.old_number < 0;

  UPDATE public.course_layouts SET
    hole_count = 18,
    par_total = (SELECT sum(par) FROM public.holes WHERE layout_id = affected_layout),
    distance_total = (SELECT sum(distance_ft) FROM public.holes WHERE layout_id = affected_layout)
  WHERE id = affected_layout;
  UPDATE public.courses SET hole_count = 27 WHERE id = affected_course;

  IF (SELECT count(*) FROM public.holes WHERE layout_id = affected_layout AND number BETWEEN 1 AND 18) <> 18
    OR (SELECT count(*) FROM public.holes WHERE layout_id = recovery_layout) <> 27 THEN
    RAISE EXCEPTION 'Recovery verification failed; rolling back';
  END IF;
END;
$recovery$;
COMMIT;

-- Confirm: course=27, Blue Tees layout=18, recovery archive=27, negative rows=0.
SELECT c.name, c.hole_count AS course_holes, l.name AS layout_name, l.hole_count AS layout_holes,
       count(h.id) AS saved_rows, count(h.id) FILTER (WHERE h.number < 1) AS temporary_numbers
FROM public.courses c JOIN public.course_layouts l ON l.course_id = c.id
LEFT JOIN public.holes h ON h.layout_id = l.id
WHERE c.id = 'a7067be0-3faf-40a9-9a6e-e3f90fcd53dd'
GROUP BY c.id, l.id ORDER BY l.name;
