
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_division text;

COMMENT ON COLUMN public.profiles.preferred_division IS
  'Player-selected PDGA division code (e.g. MPO, FPO, MA1, MA2, MA3, MA4, FA1). Used to scope Game Plan and roster views to the caller''s competitive division.';
