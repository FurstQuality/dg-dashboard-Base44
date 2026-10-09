
CREATE POLICY "storage_public_read_media" ON storage.objects FOR SELECT USING (bucket_id IN ('avatars','covers','posts'));
CREATE POLICY "storage_insert_own_folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','covers','posts') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storage_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars','covers','posts') AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storage_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars','covers','posts') AND (storage.foldername(name))[1] = auth.uid()::text);
