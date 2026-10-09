-- 1) Fix the match notification insert (notifications has no title/body/link columns,
--    and no 'system' type). Use type 'event' with a jsonb payload.
CREATE OR REPLACE FUNCTION public.run_lost_disc_matching(
  _listing_id uuid,
  _found_report_id uuid,
  _actor_id uuid,
  _mold text,
  _color text,
  _weight integer,
  _ink_name text,
  _ink_pdga text,
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

-- 2) Saved-search alerts on new listings.
CREATE OR REPLACE FUNCTION public.trg_notify_saved_searches()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  f jsonb;
  ok boolean;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;

  FOR s IN
    SELECT * FROM public.marketplace_saved_searches
    WHERE notify = true AND user_id IS DISTINCT FROM NEW.seller_id
  LOOP
    f := COALESCE(s.filters, '{}'::jsonb);
    ok := true;

    IF f ? 'brand' AND NULLIF(f->>'brand','') IS NOT NULL
      AND lower(COALESCE(NEW.brand,'')) <> lower(f->>'brand') THEN ok := false; END IF;

    IF ok AND f ? 'discType' AND NULLIF(f->>'discType','') IS NOT NULL
      AND lower(COALESCE(NEW.disc_type,'')) <> lower(f->>'discType') THEN ok := false; END IF;

    IF ok AND f ? 'condition' AND NULLIF(f->>'condition','') IS NOT NULL
      AND lower(COALESCE(NEW.condition::text,'')) <> lower(f->>'condition') THEN ok := false; END IF;

    IF ok AND f ? 'state' AND NULLIF(f->>'state','') IS NOT NULL
      AND lower(COALESCE(NEW.state_normalized, NEW.state, '')) <>
          lower(COALESCE(public.normalize_us_state(f->>'state'), f->>'state')) THEN ok := false; END IF;

    IF ok AND f ? 'city' AND NULLIF(f->>'city','') IS NOT NULL
      AND lower(COALESCE(NEW.city,'')) <> lower(f->>'city') THEN ok := false; END IF;

    IF ok AND f ? 'tradeOnly' AND (f->>'tradeOnly')::boolean IS TRUE
      AND NEW.trade_only IS NOT TRUE THEN ok := false; END IF;

    IF ok AND f ? 'maxPrice' AND NULLIF(f->>'maxPrice','') IS NOT NULL
      AND NEW.price_cents IS NOT NULL
      AND NEW.price_cents > (f->>'maxPrice')::numeric * 100 THEN ok := false; END IF;

    IF ok AND f ? 'minPrice' AND NULLIF(f->>'minPrice','') IS NOT NULL
      AND COALESCE(NEW.price_cents, 0) < (f->>'minPrice')::numeric * 100 THEN ok := false; END IF;

    IF ok AND f ? 'search' AND NULLIF(f->>'search','') IS NOT NULL
      AND concat_ws(' ', NEW.brand, NEW.mold_name, NEW.plastic_name, NEW.description)
          ILIKE '%' || (f->>'search') || '%' = false THEN ok := false; END IF;

    IF ok THEN
      INSERT INTO public.notifications (user_id, type, data)
      VALUES (
        s.user_id, 'event',
        jsonb_build_object(
          'kind', 'marketplace_saved_search',
          'title', 'New listing matches "' || s.label || '"',
          'body', concat_ws(' ', NEW.brand, NEW.mold_name) || ' just went up for sale nearby.',
          'link', '/marketplace/' || NEW.id::text
        )
      );
      UPDATE public.marketplace_saved_searches SET last_notified_at = now() WHERE id = s.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_listings_saved_search ON public.marketplace_listings;
CREATE TRIGGER marketplace_listings_saved_search AFTER INSERT ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_saved_searches();

-- 3) Watchlist alerts on price drops and status changes.
CREATE OR REPLACE FUNCTION public.trg_notify_watchers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
  msg text;
  head text;
BEGIN
  IF NEW.price_cents IS NOT NULL AND OLD.price_cents IS NOT NULL
     AND NEW.price_cents < OLD.price_cents THEN
    head := 'Price drop on a disc you watch';
    msg := concat_ws(' ', NEW.brand, NEW.mold_name) || ' dropped to $'
           || to_char(NEW.price_cents / 100.0, 'FM999999.00') || '.';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('reserved', 'sold', 'removed') THEN
    head := 'A disc you watch is now ' || NEW.status::text;
    msg := concat_ws(' ', NEW.brand, NEW.mold_name) || ' was marked ' || NEW.status::text || '.';
  ELSE
    RETURN NEW;
  END IF;

  FOR w IN
    SELECT * FROM public.marketplace_watches
    WHERE listing_id = NEW.id AND user_id IS DISTINCT FROM NEW.seller_id
  LOOP
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      w.user_id, 'event',
      jsonb_build_object(
        'kind', 'marketplace_watch',
        'title', head,
        'body', msg,
        'link', '/marketplace/' || NEW.id::text
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_listings_watchers ON public.marketplace_listings;
CREATE TRIGGER marketplace_listings_watchers AFTER UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_watchers();