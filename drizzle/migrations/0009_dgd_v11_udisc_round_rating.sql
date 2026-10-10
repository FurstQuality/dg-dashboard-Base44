ALTER TABLE public.dgd_v11_round_results ADD COLUMN IF NOT EXISTS udisc_round_rating integer;
COMMENT ON COLUMN public.dgd_v11_round_results.udisc_round_rating IS 'Native UDisc rating copied from source; never a DGD value.';

CREATE OR REPLACE FUNCTION public.get_my_dgd_preview_rounds_v3(_limit integer DEFAULT 25, _offset integer DEFAULT 0, _status text DEFAULT NULL::text, _source text DEFAULT NULL::text, _rated boolean DEFAULT NULL::boolean, _category text DEFAULT NULL::text, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _course text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, played_on date, event_name text, division text, round_number integer, layout_name text, course_name text, par integer, score integer, pdga_round_rating integer, udisc_round_rating integer, legacy_round_rating integer, status text, status_reason text, layout_knowledge text, pre_expected numeric, pre_strokes_vs_expectation numeric, likely_low numeric, likely_high numeric, ctx_expected numeric, ctx_strokes_vs_expectation numeric, event_adjustment numeric, round_performance_display numeric, display_before numeric, display_after numeric, confidence_before numeric, confidence_after numeric, sources text[], category text, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.played_on, r.event_name, r.division, r.round_number, r.layout_name, r.course_name, r.par,
    r.score, r.pdga_round_rating, r.udisc_round_rating, r.legacy_round_rating, r.status, r.status_reason, r.layout_knowledge,
    round(r.pre_expected, 1), round(r.pre_strokes_vs_expectation, 1), round(r.likely_low), round(r.likely_high),
    round(r.ctx_expected, 1), round(r.ctx_strokes_vs_expectation, 1), round(r.event_adjustment, 1),
    round(r.round_performance_display, 1), round(r.display_before, 1), round(r.display_after, 1),
    round(r.confidence_before), round(r.confidence_after), r.sources, r.category,
    count(*) OVER ()
  FROM public.dgd_v11_round_results r
  JOIN public.dgd_v11_player_state s ON s.user_id = r.user_id AND s.model_version = r.model_version
  WHERE public.dgd_preview_allowed() AND r.user_id = auth.uid()
    AND (_status IS NULL OR r.status = _status)
    AND (_source IS NULL OR _source = ANY (r.sources))
    AND (_rated IS NULL OR (r.status IN ('rated','provisional')) = _rated)
    AND (_category IS NULL OR r.category = _category)
    AND (_from IS NULL OR r.played_on >= _from)
    AND (_to IS NULL OR r.played_on <= _to)
    AND (_course IS NULL OR COALESCE(r.course_name, r.layout_name, '') ILIKE '%' || replace(replace(_course, '%', ''), '_', '') || '%')
  ORDER BY r.played_on DESC, r.seq DESC
  LIMIT LEAST(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0)
$function$;

REVOKE ALL ON FUNCTION public.get_my_dgd_preview_rounds_v3(integer,integer,text,text,boolean,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_dgd_preview_rounds_v3(integer,integer,text,text,boolean,text,date,date,text) TO authenticated;
COMMENT ON FUNCTION public.get_my_dgd_preview_rounds_v2(integer,integer,text,text,boolean,text,date,date,text) IS 'DEPRECATED: replaced by get_my_dgd_preview_rounds_v3';