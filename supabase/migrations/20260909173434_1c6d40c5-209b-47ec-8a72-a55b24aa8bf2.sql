REVOKE EXECUTE ON FUNCTION public.search_ace_knowledge(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_ace_knowledge(TEXT, TEXT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_ace_knowledge(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_ace_knowledge(TEXT, TEXT, INT) TO service_role;