CREATE POLICY "Players upload their own duel proof"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'duel-proof' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players manage their own duel proof"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'duel-proof' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Players delete their own duel proof"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'duel-proof' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Duel participants can read proof videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'duel-proof' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.duel_submissions s
        WHERE s.video_path = storage.objects.name
          AND public.is_duel_participant(s.duel_id, auth.uid())
      )
    )
  );