
-- Remove non-verified rounds: doubles/team from external_rounds; solo or unfinished round_ratings.
DELETE FROM public.external_rounds WHERE format IS DISTINCT FROM 'singles';

DELETE FROM public.round_ratings rr
 WHERE (rr.holes_played IS NULL OR rr.layout_hole_count IS NULL OR rr.holes_played < rr.layout_hole_count)
    OR (SELECT COUNT(*) FROM public.round_players rp WHERE rp.round_id = rr.round_id) < 2;
