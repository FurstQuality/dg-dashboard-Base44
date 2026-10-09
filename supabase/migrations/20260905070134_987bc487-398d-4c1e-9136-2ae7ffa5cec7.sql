ALTER TABLE public.beta_feedback ADD COLUMN IF NOT EXISTS screenshot_path text;

DROP POLICY IF EXISTS "Testers upload own beta screenshots" ON storage.objects;
CREATE POLICY "Testers upload own beta screenshots" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'beta-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Read own or admin beta screenshots" ON storage.objects;
CREATE POLICY "Read own or admin beta screenshots" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'beta-screenshots' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'super_admin')));

DROP POLICY IF EXISTS "Delete own or admin beta screenshots" ON storage.objects;
CREATE POLICY "Delete own or admin beta screenshots" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'beta-screenshots' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'super_admin')));