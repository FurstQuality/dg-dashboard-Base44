DROP POLICY IF EXISTS "Signed-in read stewards" ON public.course_stewards;
CREATE POLICY "Read own steward rows" ON public.course_stewards FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Signed-in users read tiers" ON public.dgd_tier_state;
CREATE POLICY "Read own tier state" ON public.dgd_tier_state FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.get_course_stewards(_course uuid)
RETURNS TABLE(user_id uuid, role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.role FROM public.course_stewards s
  WHERE s.course_id = _course AND auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.get_course_stewards(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_course_stewards(uuid) TO authenticated;

-- Others see only the public badge fields; full breakdown is owner/admin only.
CREATE OR REPLACE FUNCTION public.get_tier_state(_user uuid)
RETURNS TABLE(current_tier text, highest_tier_earned text, tier_score numeric, tier_version text, tier_earned_at timestamptz, categories jsonb, career jsonb, next_tier jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.current_tier, t.highest_tier_earned, t.tier_score, t.tier_version, t.tier_earned_at,
    CASE WHEN own THEN t.categories ELSE '{}'::jsonb END,
    CASE WHEN own THEN t.career ELSE '{}'::jsonb END,
    CASE WHEN own THEN t.next_tier ELSE NULL END
  FROM public.dgd_tier_state t,
    LATERAL (SELECT (t.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')) AS own) o
  WHERE t.user_id = _user AND auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.get_tier_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_tier_state(uuid) TO authenticated;