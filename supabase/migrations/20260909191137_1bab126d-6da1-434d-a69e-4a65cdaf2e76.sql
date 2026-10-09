DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'merge_duplicate_courses';

  IF def IS NULL THEN
    RAISE EXCEPTION 'merge_duplicate_courses not found';
  END IF;

  def := replace(
    def,
    'IF NOT public.has_role(auth.uid(), ''admin'') THEN',
    'IF NOT (public.has_role(auth.uid(), ''admin'') OR public.has_role(auth.uid(), ''super_admin'')) THEN'
  );
  def := replace(def, 'Only admins can merge courses', 'Only admins can merge courses');
  EXECUTE def;
END $$;