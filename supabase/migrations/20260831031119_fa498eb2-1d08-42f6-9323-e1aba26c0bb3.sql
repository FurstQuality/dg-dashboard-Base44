DROP FUNCTION IF EXISTS public.run_lost_disc_matching(uuid, uuid, uuid, text, text, integer, text, text, uuid, double precision, double precision, date);
DROP FUNCTION IF EXISTS public.run_lost_disc_matching(uuid, uuid, uuid, text, text, integer, text, integer, uuid, double precision, double precision, date) CASCADE;

CREATE FUNCTION public.run_lost_disc_matching(
  _listing_id uuid,
  _found_report_id uuid,
  _actor_id uuid,
  _mold text,
  _color text,
  _weight integer,
  _ink_name text,
  _ink_pdga integer,
  _course_id uuid,
  _lat double precision,
  _lng double precision,
  _occurred date
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  res record;
  forced boolean;
BEGIN
  IF _mold IS NULL OR btrim(_mold) = '' THEN RETURN; END IF;

  FOR rec IN
    SELECT * FROM public.lost_disc_reports
    WHERE kind = 'lost'
      AND status = 'open'
      AND user_id IS DISTINCT FROM _actor_id
      AND occurred_on >= COALESCE(_occurred, CURRENT_DATE) - INTERVAL '180 days'
  LOOP
    SELECT * INTO res FROM public.score_lost_disc_match(
      _mold, _color, _weight, _ink_name, _ink_pdga, _course_id, _lat, _lng, _occurred,
      rec.mold_name, rec.color, rec.weight_grams, rec.ink_name, rec.ink_pdga_number,
      rec.course_id, rec.latitude, rec.longitude, rec.occurred_on
    );

    forced := (_ink_name IS NOT NULL AND rec.ink_name IS NOT NULL
                AND lower(btrim(_ink_name)) = lower(btrim(rec.ink_name)))
           OR (_ink_pdga IS NOT NULL AND rec.ink_pdga_number IS NOT NULL
                AND _ink_pdga = rec.ink_pdga_number);

    IF forced OR res.score >= 55 THEN
      INSERT INTO public.marketplace_match_flags (
        listing_id, found_report_id, lost_report_id, lost_reporter_id, score, evidence
      ) VALUES (
        _listing_id, _found_report_id, rec.id, rec.user_id, res.score,
        res.evidence || jsonb_build_object('forcedReview', forced)
      )
      ON CONFLICT DO NOTHING;

      INSERT INTO public.notifications (user_id, type, data)
      VALUES (
        rec.user_id, 'event',
        jsonb_build_object(
          'kind', 'marketplace_match',
          'title', 'Possible match for your lost disc',
          'body', 'A ' || _mold || ' close to your lost disc just showed up nearby. Our team is reviewing it.',
          'link', CASE WHEN _listing_id IS NOT NULL
            THEN '/marketplace/' || _listing_id::text
            ELSE '/marketplace/lost-found' END
        )
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('run_lost_disc_matching','score_lost_disc_match','record_marketplace_price',
                      'trg_notify_saved_searches','trg_notify_watchers','trg_match_found_report',
                      'trg_match_marketplace_listing','trg_lost_disc_reunited')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;