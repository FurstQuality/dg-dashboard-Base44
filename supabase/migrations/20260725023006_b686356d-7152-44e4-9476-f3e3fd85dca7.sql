-- Tighten overly broad SELECT policies flagged by security scan.

-- avatar_configs: private to owner
DROP POLICY IF EXISTS "Avatars authenticated read" ON public.avatar_configs;
CREATE POLICY "Own avatar read" ON public.avatar_configs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- bag_configs: private to owner
DROP POLICY IF EXISTS "Bags authenticated read" ON public.bag_configs;
CREATE POLICY "Own bag read" ON public.bag_configs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- user_discs: private to owner
DROP POLICY IF EXISTS "Discs authenticated read" ON public.user_discs;
CREATE POLICY "Own discs read" ON public.user_discs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- external_chat_links: creator, entity owner, or verified member/registrant only
DROP POLICY IF EXISTS "Anyone signed in can view external chat links" ON public.external_chat_links;
CREATE POLICY "Members can view external chat links" ON public.external_chat_links
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (
      owner_type = 'club' AND (
        EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = external_chat_links.owner_id AND c.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = external_chat_links.owner_id AND m.user_id = auth.uid())
      )
    )
    OR (
      owner_type = 'league' AND (
        EXISTS (SELECT 1 FROM public.leagues l WHERE l.id = external_chat_links.owner_id AND l.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.league_registrations r WHERE r.league_id = external_chat_links.owner_id AND r.user_id = auth.uid())
      )
    )
    OR (
      owner_type = 'tournament' AND (
        EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = external_chat_links.owner_id AND t.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.tournament_registrations r WHERE r.tournament_id = external_chat_links.owner_id AND r.user_id = auth.uid())
      )
    )
  );