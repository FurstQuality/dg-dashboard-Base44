CREATE TABLE public.open_event_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_token TEXT NOT NULL UNIQUE,
  edit_token TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled event',
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.open_event_plans TO service_role;

ALTER TABLE public.open_event_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX open_event_plans_updated_at_idx ON public.open_event_plans (updated_at DESC);

CREATE TRIGGER update_open_event_plans_updated_at
  BEFORE UPDATE ON public.open_event_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();