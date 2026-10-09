
CREATE OR REPLACE FUNCTION public.pdga_kb_search_courses(_q text, _limit int DEFAULT 15)
RETURNS TABLE(
  id uuid, pdga_course_id text, name text, city text, state text, country text,
  hole_count int, latitude double precision, longitude double precision,
  designer text, pdga_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.pdga_course_id, c.name, c.city, c.state, c.country,
         c.hole_count, c.latitude, c.longitude, c.designer, c.pdga_url
    FROM public.pdga_kb_courses c
   WHERE auth.uid() IS NOT NULL
     AND (
       coalesce(_q,'') = '' OR
       c.name ILIKE '%'||_q||'%' OR
       coalesce(c.city,'') ILIKE '%'||_q||'%' OR
       coalesce(c.state,'') ILIKE '%'||_q||'%'
     )
   ORDER BY (lower(c.name) = lower(coalesce(_q,''))) DESC,
            (c.name ILIKE _q||'%') DESC,
            c.name
   LIMIT GREATEST(1, LEAST(coalesce(_limit,15), 100));
$$;
GRANT EXECUTE ON FUNCTION public.pdga_kb_search_courses(text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.pdga_kb_search_players(_q text, _limit int DEFAULT 15)
RETURNS TABLE(
  id uuid, pdga_number int, name text, rating int, class text,
  city text, state text, country text, career_wins int, pdga_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.pdga_number, p.name, p.rating, p.class,
         p.city, p.state, p.country, p.career_wins, p.pdga_url
    FROM public.pdga_kb_players p
   WHERE auth.uid() IS NOT NULL
     AND (
       coalesce(_q,'') = '' OR
       p.name ILIKE '%'||_q||'%' OR
       p.pdga_number::text = _q OR
       coalesce(p.city,'') ILIKE '%'||_q||'%' OR
       coalesce(p.state,'') ILIKE '%'||_q||'%'
     )
   ORDER BY (p.pdga_number::text = coalesce(_q,'')) DESC,
            (p.name ILIKE _q||'%') DESC,
            coalesce(p.rating, 0) DESC,
            p.name
   LIMIT GREATEST(1, LEAST(coalesce(_limit,15), 100));
$$;
GRANT EXECUTE ON FUNCTION public.pdga_kb_search_players(text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.pdga_kb_search_events(_q text, _limit int DEFAULT 15)
RETURNS TABLE(
  id uuid, pdga_event_id text, name text, tier text,
  start_date date, end_date date, host_club text,
  city text, state text, country text, pdga_url text, course_refs text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.pdga_event_id, e.name, e.tier, e.start_date, e.end_date,
         e.host_club, e.city, e.state, e.country, e.pdga_url, e.course_refs
    FROM public.pdga_kb_events e
   WHERE auth.uid() IS NOT NULL
     AND (
       coalesce(_q,'') = '' OR
       e.name ILIKE '%'||_q||'%' OR
       coalesce(e.host_club,'') ILIKE '%'||_q||'%' OR
       coalesce(e.city,'') ILIKE '%'||_q||'%' OR
       coalesce(e.state,'') ILIKE '%'||_q||'%'
     )
   ORDER BY coalesce(e.start_date, DATE '1900-01-01') DESC, e.name
   LIMIT GREATEST(1, LEAST(coalesce(_limit,15), 100));
$$;
GRANT EXECUTE ON FUNCTION public.pdga_kb_search_events(text,int) TO authenticated;
