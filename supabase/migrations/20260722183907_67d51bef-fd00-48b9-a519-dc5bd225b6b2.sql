
CREATE POLICY "Signed-in users can read avatar-library"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatar-library');

CREATE POLICY "Super admins can insert avatar-library"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatar-library' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update avatar-library"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatar-library' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete avatar-library"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatar-library' AND public.has_role(auth.uid(), 'super_admin'));
