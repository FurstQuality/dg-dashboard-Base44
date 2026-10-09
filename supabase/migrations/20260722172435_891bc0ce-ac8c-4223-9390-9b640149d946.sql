
-- Add composite index to speed up per-source rating fetches (stats hub top query).
CREATE INDEX IF NOT EXISTS external_rounds_user_source_played_idx
  ON public.external_rounds (user_id, source, played_on DESC);

-- Drop duplicate indexes to cut write amplification on hot tables.
DROP INDEX IF EXISTS public.idx_ext_rounds_user_date;         -- dup of external_rounds_user_played_idx
DROP INDEX IF EXISTS public.holes_layout_number_idx;          -- dup of holes_layout_id_number_key (unique)
DROP INDEX IF EXISTS public.idx_holes_layout;                 -- prefix of holes_layout_id_number_key
DROP INDEX IF EXISTS public.course_features_layout_idx;       -- prefix of idx_course_features_layout_hole
DROP INDEX IF EXISTS public.idx_layouts_course;               -- dup of course_layouts_course_idx
DROP INDEX IF EXISTS public.idx_notif_user;                   -- dup of notifications_user_created_idx
DROP INDEX IF EXISTS public.idx_posts_created;                -- covered by posts_created_at_idx
