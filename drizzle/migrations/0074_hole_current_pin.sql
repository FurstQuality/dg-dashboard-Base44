ALTER TABLE public.holes ADD COLUMN IF NOT EXISTS current_pin text;
COMMENT ON COLUMN public.holes.current_pin IS 'Name of the basket position in use now (matches basket_name or a hole_baskets.name); null = main position.';

CREATE TABLE public.hole_pin_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hole_id uuid NOT NULL REFERENCES public.holes(id) ON DELETE CASCADE,
  pin_name text,
  previous_pin text,
  set_by uuid DEFAULT auth.uid(),
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hole_pin_placements_hole ON public.hole_pin_placements(hole_id, set_at DESC);
GRANT SELECT ON public.hole_pin_placements TO anon, authenticated;
GRANT ALL ON public.hole_pin_placements TO service_role;
ALTER TABLE public.hole_pin_placements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pin history is readable" ON public.hole_pin_placements FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.log_hole_pin_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.current_pin IS DISTINCT FROM OLD.current_pin THEN
    INSERT INTO public.hole_pin_placements(hole_id, pin_name, previous_pin, set_by)
    VALUES (NEW.id, NEW.current_pin, OLD.current_pin, auth.uid());
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_hole_pin_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_hole_pin_change AFTER UPDATE OF current_pin ON public.holes
FOR EACH ROW EXECUTE FUNCTION public.log_hole_pin_change();