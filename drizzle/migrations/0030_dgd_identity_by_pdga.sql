CREATE OR REPLACE FUNCTION public.get_dgd_identity_by_pdga(_pdga text[])
RETURNS TABLE(pdga_number text, dgd_rating integer, tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (p.pdga_number) p.pdga_number,
         public.dgd_scale_1000_public(s.display_rating)::integer,
         COALESCE(t.current_tier, 'GREEN')
  FROM public.profiles p
  JOIN public.dgd_v13_player_state s ON s.user_id = p.id
  LEFT JOIN public.dgd_tier_state t ON t.user_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.pdga_number = ANY(_pdga[1:300])
    AND s.display_rating IS NOT NULL
    AND COALESCE(p.privacy_prefs->>'show_ratings', 'true') <> 'false'
  ORDER BY p.pdga_number, s.updated_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_dgd_identity_by_pdga(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dgd_identity_by_pdga(text[]) TO authenticated;