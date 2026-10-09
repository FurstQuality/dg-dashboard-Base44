GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.friend_suggestions(uuid, integer) FROM authenticated, service_role;

DROP POLICY IF EXISTS "Courses viewable when approved or owned" ON public.courses;
DROP POLICY IF EXISTS "Creators or admins can update courses" ON public.courses;
DROP POLICY IF EXISTS "Creators or admins can delete courses" ON public.courses;

CREATE POLICY "Approved courses are public"
ON public.courses
FOR SELECT
TO anon, authenticated
USING (moderation_status = 'approved'::public.moderation_status);

CREATE POLICY "Course owners and admins can view courses"
ON public.courses
FOR SELECT
TO authenticated
USING ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Course creators or admins update courses"
ON public.courses
FOR UPDATE
TO authenticated
USING ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Course creators or admins delete courses"
ON public.courses
FOR DELETE
TO authenticated
USING ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));