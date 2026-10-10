CREATE TABLE public.dgd_v13_player_state (LIKE public.dgd_v12_player_state INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
GRANT SELECT ON public.dgd_v13_player_state TO authenticated;
GRANT ALL ON public.dgd_v13_player_state TO service_role;
ALTER TABLE public.dgd_v13_player_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read V1.3 states" ON public.dgd_v13_player_state FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

CREATE TABLE public.dgd_v13_state_history (LIKE public.dgd_v12_state_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
GRANT SELECT ON public.dgd_v13_state_history TO authenticated;
GRANT ALL ON public.dgd_v13_state_history TO service_role;
ALTER TABLE public.dgd_v13_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read V1.3 history" ON public.dgd_v13_state_history FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

COMMENT ON TABLE public.dgd_v13_player_state IS 'DGD V1.3 (dgd-core-v1.3@0.3.0) hidden research candidate. Admin-only; never player-facing.';