CREATE POLICY "Marketplace photos readable by signed-in players"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketplace');

CREATE POLICY "Players upload their own marketplace photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players update their own marketplace photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players delete their own marketplace photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);