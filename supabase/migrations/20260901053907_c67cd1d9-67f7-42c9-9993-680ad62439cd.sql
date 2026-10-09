CREATE TABLE public.event_setup_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('league','tournament')),
  title text,
  step integer NOT NULL DEFAULT 0 CHECK (step >= 0 AND step <= 40),
  series_id uuid REFERENCES public.event_series(id) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_setup_drafts TO authenticated;
GRANT ALL ON public.event_setup_drafts TO service_role;

ALTER TABLE public.event_setup_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own setup drafts"
  ON public.event_setup_drafts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX event_setup_drafts_user_kind_idx
  ON public.event_setup_drafts (user_id, kind, updated_at DESC);

CREATE TRIGGER event_setup_drafts_set_updated_at
  BEFORE UPDATE ON public.event_setup_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();