-- Phase 9: public V1.3 DGD identity (rating on 0-1000 + tier) for any player, and V1.3 round ratings by source row.
CREATE OR REPLACE FUNCTION public.get_player_dgd_identity(_users uuid[])
RETURNS TABLE(user_id uuid, dgd_rating integer, form_value integer, confidence integer, rating_status text, eligible_rounds integer, tier text, tier_score numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT u, public.dgd_scale_1000_public(s.display_rating), public.dgd_scale_1000_public(s.form_value),
         round(s.confidence)::integer, s.rating_status, s.eligible_rounds,
         t.current_tier, t.tier_score
  FROM unnest(_users[1:200]) AS u
  LEFT JOIN public.dgd_v13_player_state s ON s.user_id = u
  LEFT JOIN public.dgd_tier_state t ON t.user_id = u
  WHERE auth.uid() IS NOT NULL AND (s.user_id IS NOT NULL OR t.user_id IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.get_player_dgd_identity(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_dgd_identity(uuid[]) TO authenticated;

-- V1.3 round rating for source rows (external_rounds / rounds ids) owned by the caller or by any player (round ratings are public performance).
CREATE OR REPLACE FUNCTION public.get_dgd_round_ratings(_source_ids uuid[])
RETURNS TABLE(source_row_id uuid, canonical_round_id uuid, dgd_round_rating integer, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (c.source_row_id) c.source_row_id, c.canonical_round_id,
         CASE WHEN r.status IN ('rated','provisional') THEN public.dgd_scale_1000_public(r.round_performance_display) END, r.status
  FROM public.canonical_round_sources c
  JOIN public.dgd_v11_round_results r ON r.canonical_round_id = c.canonical_round_id AND r.model_version = 'dgd-core-v1.3@0.3.0'
  WHERE auth.uid() IS NOT NULL AND c.source_row_id = ANY(_source_ids[1:500])
  ORDER BY c.source_row_id, r.seq DESC;
$$;
REVOKE ALL ON FUNCTION public.get_dgd_round_ratings(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dgd_round_ratings(uuid[]) TO authenticated;