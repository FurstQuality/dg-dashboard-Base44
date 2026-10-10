-- Phase 8.3: layouts reference canonical course assets.
ALTER TABLE public.course_layouts
  ADD COLUMN IF NOT EXISTS copied_from_layout_id uuid REFERENCES public.course_layouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS numbering_mode text NOT NULL DEFAULT 'route',
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.course_layouts DROP CONSTRAINT IF EXISTS course_layouts_status_chk;
ALTER TABLE public.course_layouts ADD CONSTRAINT course_layouts_status_chk
  CHECK (status IN ('draft','published','seasonal','retired','archived'));
ALTER TABLE public.course_layouts DROP CONSTRAINT IF EXISTS course_layouts_numbering_chk;
ALTER TABLE public.course_layouts ADD CONSTRAINT course_layouts_numbering_chk
  CHECK (numbering_mode IN ('route','course'));

CREATE TABLE public.course_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  label text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_holes_course_idx ON public.course_holes(course_id);

CREATE TABLE public.course_tees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  course_hole_id uuid NOT NULL REFERENCES public.course_holes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Main',
  color text,
  latitude double precision,
  longitude double precision,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_tees_hole_idx ON public.course_tees(course_hole_id);
CREATE INDEX course_tees_course_idx ON public.course_tees(course_id);

CREATE TABLE public.course_baskets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  course_hole_id uuid NOT NULL REFERENCES public.course_holes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'A',
  latitude double precision,
  longitude double precision,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_baskets_hole_idx ON public.course_baskets(course_hole_id);
CREATE INDEX course_baskets_course_idx ON public.course_baskets(course_id);

CREATE TABLE public.layout_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  display_label text NOT NULL,
  course_hole_id uuid NOT NULL REFERENCES public.course_holes(id) ON DELETE RESTRICT,
  tee_id uuid REFERENCES public.course_tees(id) ON DELETE RESTRICT,
  basket_id uuid REFERENCES public.course_baskets(id) ON DELETE RESTRICT,
  par integer,
  flight_path jsonb,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  included boolean NOT NULL DEFAULT true,
  legacy_hole_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (layout_id, position)
);
CREATE INDEX layout_slots_layout_idx ON public.layout_slots(layout_id);
CREATE INDEX layout_slots_tee_idx ON public.layout_slots(tee_id);
CREATE INDEX layout_slots_basket_idx ON public.layout_slots(basket_id);

CREATE TABLE public.layout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES public.course_layouts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  summary text,
  published_by uuid,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (layout_id, version)
);

-- Backfill: one canonical hole per physical_hole_key.
INSERT INTO public.course_holes (id, course_id, label)
SELECT DISTINCT ON (h.physical_hole_key) h.physical_hole_key, l.course_id,
       COALESCE(NULLIF(trim(h.nickname),''), h.number::text)
FROM public.holes h JOIN public.course_layouts l ON l.id = h.layout_id
ORDER BY h.physical_hole_key, h.number;

INSERT INTO public.course_tees (course_id, course_hole_id, name, color, latitude, longitude)
SELECT DISTINCT ON (h.physical_hole_key, round(h.tee_lat::numeric,6), round(h.tee_lng::numeric,6))
  l.course_id, h.physical_hole_key, COALESCE(NULLIF(h.tee_name,''),'Main'), h.tee_color, h.tee_lat, h.tee_lng
FROM public.holes h JOIN public.course_layouts l ON l.id = h.layout_id
WHERE h.tee_lat IS NOT NULL AND h.tee_lng IS NOT NULL
ORDER BY h.physical_hole_key, round(h.tee_lat::numeric,6), round(h.tee_lng::numeric,6);

INSERT INTO public.course_baskets (course_id, course_hole_id, name, latitude, longitude)
SELECT DISTINCT ON (h.physical_hole_key, round(h.basket_lat::numeric,6), round(h.basket_lng::numeric,6))
  l.course_id, h.physical_hole_key, COALESCE(NULLIF(h.basket_name,''),'A'), h.basket_lat, h.basket_lng
FROM public.holes h JOIN public.course_layouts l ON l.id = h.layout_id
WHERE h.basket_lat IS NOT NULL AND h.basket_lng IS NOT NULL
ORDER BY h.physical_hole_key, round(h.basket_lat::numeric,6), round(h.basket_lng::numeric,6);

INSERT INTO public.layout_slots (layout_id, position, display_label, course_hole_id, tee_id, basket_id, par, flight_path, legacy_hole_id)
SELECT h.layout_id,
       row_number() OVER (PARTITION BY h.layout_id ORDER BY h.number, h.id),
       COALESCE(NULLIF(trim(h.nickname),''), h.number::text),
       h.physical_hole_key,
       (SELECT t.id FROM public.course_tees t WHERE t.course_hole_id = h.physical_hole_key
          AND round(t.latitude::numeric,6) = round(h.tee_lat::numeric,6)
          AND round(t.longitude::numeric,6) = round(h.tee_lng::numeric,6) LIMIT 1),
       (SELECT b.id FROM public.course_baskets b WHERE b.course_hole_id = h.physical_hole_key
          AND round(b.latitude::numeric,6) = round(h.basket_lat::numeric,6)
          AND round(b.longitude::numeric,6) = round(h.basket_lng::numeric,6) LIMIT 1),
       h.par, h.flight_path, h.id
FROM public.holes h;

-- Permissions helper: steward of the course, or creator of a draft layout.
CREATE OR REPLACE FUNCTION public.can_edit_layout(_layout uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_layouts l
    WHERE l.id = _layout AND _user IS NOT NULL
      AND (public.can_steward_course(l.course_id, _user)
           OR (l.status = 'draft' AND l.created_by = _user))
  )
$$;

GRANT SELECT ON public.course_holes, public.course_tees, public.course_baskets, public.layout_slots, public.layout_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.course_holes, public.course_tees, public.course_baskets, public.layout_slots TO authenticated;
GRANT ALL ON public.course_holes, public.course_tees, public.course_baskets, public.layout_slots, public.layout_versions TO service_role;

ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_baskets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layout_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layout_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in players read course holes" ON public.course_holes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Stewards manage course holes" ON public.course_holes FOR ALL TO authenticated
  USING (public.can_steward_course(course_id, auth.uid())) WITH CHECK (public.can_steward_course(course_id, auth.uid()));
CREATE POLICY "Signed-in players read course tees" ON public.course_tees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Stewards manage course tees" ON public.course_tees FOR ALL TO authenticated
  USING (public.can_steward_course(course_id, auth.uid())) WITH CHECK (public.can_steward_course(course_id, auth.uid()));
CREATE POLICY "Signed-in players read course baskets" ON public.course_baskets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Stewards manage course baskets" ON public.course_baskets FOR ALL TO authenticated
  USING (public.can_steward_course(course_id, auth.uid())) WITH CHECK (public.can_steward_course(course_id, auth.uid()));

CREATE POLICY "Read slots of visible layouts" ON public.layout_slots FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.course_layouts l WHERE l.id = layout_id
          AND (l.status <> 'draft' OR public.can_edit_layout(l.id, auth.uid()))));
CREATE POLICY "Editors manage slots" ON public.layout_slots FOR ALL TO authenticated
  USING (public.can_edit_layout(layout_id, auth.uid())) WITH CHECK (public.can_edit_layout(layout_id, auth.uid()));

CREATE POLICY "Read layout versions" ON public.layout_versions FOR SELECT TO authenticated USING (true);

-- Publish: stewards only; writes an immutable resolved snapshot.
CREATE OR REPLACE FUNCTION public.publish_layout(_layout uuid, _summary text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid; v_next integer; v_snap jsonb;
BEGIN
  SELECT course_id INTO v_course FROM course_layouts WHERE id = _layout;
  IF v_course IS NULL THEN RAISE EXCEPTION 'Layout not found'; END IF;
  IF NOT can_steward_course(v_course, auth.uid()) THEN RAISE EXCEPTION 'Only course stewards can publish layouts'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'position', s.position, 'label', s.display_label, 'course_hole_id', s.course_hole_id,
      'tee_id', s.tee_id, 'tee_name', t.name, 'tee', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_array(t.latitude, t.longitude) END,
      'basket_id', s.basket_id, 'basket_name', b.name, 'basket', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_array(b.latitude, b.longitude) END,
      'par', s.par, 'rules', s.rules) ORDER BY s.position), '[]'::jsonb)
    INTO v_snap
  FROM layout_slots s LEFT JOIN course_tees t ON t.id = s.tee_id LEFT JOIN course_baskets b ON b.id = s.basket_id
  WHERE s.layout_id = _layout AND s.included;
  SELECT COALESCE(max(version),0)+1 INTO v_next FROM layout_versions WHERE layout_id = _layout;
  INSERT INTO layout_versions (layout_id, version, snapshot, summary, published_by) VALUES (_layout, v_next, v_snap, _summary, auth.uid());
  UPDATE course_layouts SET status = CASE WHEN status IN ('draft','retired','archived') THEN 'published' ELSE status END,
    current_version = v_next WHERE id = _layout;
  RETURN v_next;
END $$;
REVOKE ALL ON FUNCTION public.publish_layout(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_layout(uuid, text) TO authenticated;

-- Copy: clones slot rows only (references), never geometry. Result is a draft.
CREATE OR REPLACE FUNCTION public.copy_layout(_source uuid, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_course uuid; v_new uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Layout name required'; END IF;
  SELECT course_id INTO v_course FROM course_layouts WHERE id = _source AND status <> 'draft';
  IF v_course IS NULL AND NOT can_edit_layout(_source, auth.uid()) THEN RAISE EXCEPTION 'Layout not found'; END IF;
  SELECT course_id INTO v_course FROM course_layouts WHERE id = _source;
  INSERT INTO course_layouts (course_id, name, created_by, status, copied_from_layout_id, numbering_mode, family, is_default)
  SELECT course_id, trim(_name), auth.uid(), 'draft', id, numbering_mode, family, false FROM course_layouts WHERE id = _source
  RETURNING id INTO v_new;
  INSERT INTO layout_slots (layout_id, position, display_label, course_hole_id, tee_id, basket_id, par, flight_path, rules, included)
  SELECT v_new, position, display_label, course_hole_id, tee_id, basket_id, par, flight_path, rules, included
  FROM layout_slots WHERE layout_id = _source;
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.copy_layout(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.copy_layout(uuid, text) TO authenticated;

-- Existing layouts become version 1.
INSERT INTO public.layout_versions (layout_id, version, snapshot, summary)
SELECT l.id, 1, COALESCE((SELECT jsonb_agg(jsonb_build_object('position', s.position, 'label', s.display_label,
   'course_hole_id', s.course_hole_id, 'tee_id', s.tee_id, 'basket_id', s.basket_id, 'par', s.par) ORDER BY s.position)
   FROM public.layout_slots s WHERE s.layout_id = l.id), '[]'::jsonb), 'Imported from the original layout'
FROM public.course_layouts l;
