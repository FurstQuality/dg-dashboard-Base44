-- Move to negatives first to avoid unique (layout_id, number) collisions,
-- then assign clean 1..N based on sorted (number mod 1000).
DO $$
DECLARE
  target uuid := 'b5b97235-5af2-4e99-9c2d-f0f4406c5fcd';
  r record;
  i int := 0;
BEGIN
  UPDATE public.holes SET number = -abs(number) - 1 WHERE layout_id = target;
  FOR r IN
    SELECT id FROM public.holes
    WHERE layout_id = target
    ORDER BY ((-number - 1)) % 1000
  LOOP
    i := i + 1;
    UPDATE public.holes SET number = i WHERE id = r.id;
  END LOOP;
END $$;