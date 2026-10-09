
REVOKE ALL ON FUNCTION public.get_my_data_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_data_health() TO authenticated;
