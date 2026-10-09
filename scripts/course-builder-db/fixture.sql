-- Disposable test schema only. It is intentionally not a production migration.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.courses (id uuid PRIMARY KEY, created_by uuid);
CREATE TABLE public.course_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid REFERENCES public.courses,
  name text, created_by uuid, is_default boolean DEFAULT false,
  hole_count integer, par_total integer, played_rule_ids uuid[]
);
CREATE TABLE public.holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), layout_id uuid REFERENCES public.course_layouts,
  physical_hole_key uuid, number integer, nickname text, par integer, par_confirmed boolean DEFAULT false,
  tee_lat double precision, tee_lng double precision, basket_lat double precision, basket_lng double precision,
  tee_name text, tee_color text, basket_name text, flight_path jsonb, distance_ft integer
);
CREATE FUNCTION public.can_steward_course(_course uuid, _user uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT _user IS NOT NULL AND EXISTS (SELECT 1 FROM public.courses WHERE id = _course AND created_by = _user)
  $$;
CREATE TABLE public.hole_tees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hole_id uuid REFERENCES public.holes,
  name text, color text, distance_ft integer, latitude double precision, longitude double precision,
  sort_order integer DEFAULT 0, flight_path jsonb
);
CREATE TABLE public.hole_baskets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), hole_id uuid REFERENCES public.holes,
  name text, color text, distance_ft integer, latitude double precision, longitude double precision,
  sort_order integer DEFAULT 0, split_point jsonb
);
CREATE TABLE public.course_event_overlays (id uuid PRIMARY KEY, tournament_id uuid, league_event_id uuid);
CREATE TABLE public.course_features (
  id uuid PRIMARY KEY, course_id uuid REFERENCES public.courses, layout_id uuid REFERENCES public.course_layouts,
  type text, layer text, hole_number integer, hole_numbers integer[], geometry jsonb,
  ob_side text, label text, notes text, event_overlay_id uuid REFERENCES public.course_event_overlays
);
CREATE TABLE public.tournament_rounds (
  id uuid PRIMARY KEY, tournament_id uuid, course_id uuid REFERENCES public.courses,
  layout_id uuid REFERENCES public.course_layouts, layout_version_id uuid, rules_snapshot jsonb
);
CREATE TABLE public.league_events (
  id uuid PRIMARY KEY, league_id uuid, course_id uuid REFERENCES public.courses,
  layout_id uuid REFERENCES public.course_layouts, layout_version_id uuid, rules_snapshot jsonb
);
-- Event ownership and hosting roles are fixture boundaries. Tests install the
-- real event_has_capability function from 0060 rather than simulate its result.
CREATE TABLE public.fixture_event_owners (event_id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.event_managers (
  kind text, event_id uuid, user_id uuid, staff_role text,
  extra_capabilities text[] DEFAULT '{}', revoked_capabilities text[] DEFAULT '{}'
);
CREATE TABLE public.event_role_capabilities (staff_role text, capability text);
CREATE FUNCTION public.event_owner_id(_kind text, _event uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT user_id FROM public.fixture_event_owners WHERE event_id = _event
  $$;
CREATE FUNCTION public.has_role(_user uuid, _role text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_owner_only_capability(_cap text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT _cap = 'event.delete' $$;
CREATE FUNCTION public.controls_event_access(_kind text, _event uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_tournament_staff(_event uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.latest_layout_version(_layout uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.layout_versions WHERE layout_id = _layout ORDER BY version DESC LIMIT 1
$$;
