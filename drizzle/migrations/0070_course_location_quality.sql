-- How trustworthy a course pin is. A course needs only identity + a usable
-- location to appear on the map; approximate pins must say so.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS location_quality text NOT NULL DEFAULT 'unknown'
    CHECK (location_quality IN ('verified_gps','source_coordinate','address_geocoded','park_geocoded','city_approximate','unknown')),
  ADD COLUMN IF NOT EXISTS location_source text;

UPDATE public.courses SET location_quality = 'source_coordinate',
  location_source = coalesce(location_source, source)
WHERE latitude IS NOT NULL AND location_quality = 'unknown';

UPDATE public.courses c SET location_quality = 'verified_gps'
WHERE latitude IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.course_layouts l JOIN public.holes h ON h.layout_id = l.id
  WHERE l.course_id = c.id AND h.tee_lat IS NOT NULL);

CREATE INDEX IF NOT EXISTS courses_location_quality_idx ON public.courses (location_quality);