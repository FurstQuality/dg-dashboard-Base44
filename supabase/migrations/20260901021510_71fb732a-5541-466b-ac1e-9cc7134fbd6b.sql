ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS pdga_sanctioned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdga_tier text,
  ADD COLUMN IF NOT EXISTS pdga_event_number text;

CREATE TABLE IF NOT EXISTS public.league_checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  phase text NOT NULL,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_checklist_items_league_idx
  ON public.league_checklist_items (league_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_checklist_items TO authenticated;
GRANT ALL ON public.league_checklist_items TO service_role;

ALTER TABLE public.league_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read league checklists"
  ON public.league_checklist_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "League managers manage checklist items"
  ON public.league_checklist_items FOR ALL
  TO authenticated
  USING (public.can_manage_league(league_id, auth.uid()))
  WITH CHECK (public.can_manage_league(league_id, auth.uid()));

CREATE TRIGGER league_checklist_items_set_updated_at
  BEFORE UPDATE ON public.league_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();