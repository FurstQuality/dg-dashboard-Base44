-- Allow videos in the personal course scrapbook alongside photos and scorecards.
ALTER TABLE public.course_book_media DROP CONSTRAINT IF EXISTS course_book_media_kind_check;
ALTER TABLE public.course_book_media
  ADD CONSTRAINT course_book_media_kind_check
  CHECK (kind = ANY (ARRAY['photo'::text, 'scorecard'::text, 'video'::text]));