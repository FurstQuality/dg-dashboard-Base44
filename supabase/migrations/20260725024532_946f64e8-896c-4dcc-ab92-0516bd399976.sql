-- Restrict TD contact info (td_email, td_phone) to authenticated users only.
-- Anonymous visitors keep read access to public tournament/league info but
-- cannot see the director's personal email or phone.
REVOKE SELECT (td_email, td_phone) ON public.tournaments FROM anon;
REVOKE SELECT (td_email, td_phone) ON public.leagues FROM anon;