DROP POLICY IF EXISTS tee_sign_media_read ON storage.objects;
CREATE POLICY tee_sign_media_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hole-media' AND EXISTS (SELECT 1 FROM public.tee_sign_media t WHERE t.storage_path = objects.name));