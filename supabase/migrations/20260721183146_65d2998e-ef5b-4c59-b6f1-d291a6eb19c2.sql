
CREATE POLICY "hole_media_read" ON storage.objects FOR SELECT
USING (bucket_id = 'hole-media');

CREATE POLICY "hole_media_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hole-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "hole_media_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'hole-media' AND owner = auth.uid());

CREATE POLICY "hole_media_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'hole-media' AND owner = auth.uid());
