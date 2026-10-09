-- Grant read access on pdga_events so authenticated users' server functions
-- (Event Highlights, ratings-lab, tracker) can actually read place/points rows.
-- Policy already allows public reads (USING true); table-level GRANT was missing,
-- so PostgREST silently returned empty result sets.
GRANT SELECT ON public.pdga_events TO authenticated, anon;
GRANT ALL ON public.pdga_events TO service_role;