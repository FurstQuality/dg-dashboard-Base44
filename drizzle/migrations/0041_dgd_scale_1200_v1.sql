-- dgd-scale-1200-v1: PDGA-like 500–1200 public scale. Skill unchanged; only display mapping.
CREATE OR REPLACE FUNCTION public.dgd_scale_1200(_a numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _a IS NULL THEN NULL ELSE (500.0 + 700.0 / (1.0 + exp(-((_a - 50) / 2.5) / 9.0)))::numeric END $$;
CREATE OR REPLACE FUNCTION public.dgd_scale_1200_public(_a numeric) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE WHEN _a IS NULL THEN NULL ELSE LEAST(1199, round(public.dgd_scale_1200(_a)))::integer END $$;
-- Legacy names now delegate so every public RPC switches to the active scale in one place.
CREATE OR REPLACE FUNCTION public.dgd_scale_1000(_a numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT public.dgd_scale_1200(_a) $$;
CREATE OR REPLACE FUNCTION public.dgd_scale_1000_public(_a numeric) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT public.dgd_scale_1200_public(_a) $$;
COMMENT ON FUNCTION public.dgd_scale_1000(numeric) IS 'DEPRECATED name: delegates to active public scale dgd_scale_1200 (dgd-scale-1200-v1).';
COMMENT ON FUNCTION public.dgd_scale_1000_public(numeric) IS 'DEPRECATED name: delegates to dgd_scale_1200_public (cap 1199).';