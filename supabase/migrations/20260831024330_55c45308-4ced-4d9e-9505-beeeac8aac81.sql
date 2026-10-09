-- ============ ENUMS ============
CREATE TYPE public.marketplace_listing_status AS ENUM ('active','reserved','sold','removed');
CREATE TYPE public.lost_disc_kind AS ENUM ('lost','found');
CREATE TYPE public.lost_disc_status AS ENUM ('open','matched','reunited','closed');
CREATE TYPE public.lost_disc_claim_state AS ENUM ('pending','confirmed','rejected');
CREATE TYPE public.marketplace_flag_status AS ENUM ('open','dismissed','warned','hidden','connected');

-- ============ LISTINGS ============
CREATE TABLE public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mold_id uuid REFERENCES public.disc_molds ON DELETE SET NULL,
  plastic_id uuid REFERENCES public.disc_plastics ON DELETE SET NULL,
  user_disc_id uuid REFERENCES public.user_discs ON DELETE SET NULL,
  brand text,
  mold_name text NOT NULL,
  plastic_name text,
  disc_type text,
  speed numeric,
  glide numeric,
  turn numeric,
  fade numeric,
  color text,
  weight_grams integer,
  condition disc_condition,
  ink_notes text,
  ink_name text,
  ink_pdga_number integer,
  description text,
  price_cents integer,
  trade_only boolean NOT NULL DEFAULT false,
  status marketplace_listing_status NOT NULL DEFAULT 'active',
  course_id uuid REFERENCES public.courses ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  city text,
  state text,
  view_count integer NOT NULL DEFAULT 0,
  bumped_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  sold_to_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_listings_status_idx ON public.marketplace_listings (status, bumped_at DESC);
CREATE INDEX marketplace_listings_seller_idx ON public.marketplace_listings (seller_id, created_at DESC);
CREATE INDEX marketplace_listings_state_idx ON public.marketplace_listings (state, city);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players can browse visible listings" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (status <> 'removed' OR seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Sellers create their own listings" ON public.marketplace_listings
  FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid());
CREATE POLICY "Sellers update their own listings" ON public.marketplace_listings
  FOR UPDATE TO authenticated USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Sellers delete their own listings" ON public.marketplace_listings
  FOR DELETE TO authenticated USING (seller_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER marketplace_listings_touch BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER marketplace_listings_state BEFORE INSERT OR UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

-- ============ PHOTOS ============
CREATE TABLE public.marketplace_listing_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_listing_photos_listing_idx ON public.marketplace_listing_photos (listing_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listing_photos TO authenticated;
GRANT ALL ON public.marketplace_listing_photos TO service_role;
ALTER TABLE public.marketplace_listing_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Photos follow their listing" ON public.marketplace_listing_photos
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = listing_id));
CREATE POLICY "Owners manage listing photos" ON public.marketplace_listing_photos
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ PRICE HISTORY ============
CREATE TABLE public.marketplace_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings ON DELETE CASCADE,
  price_cents integer,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_price_history_listing_idx ON public.marketplace_price_history (listing_id, changed_at DESC);
GRANT SELECT ON public.marketplace_price_history TO authenticated;
GRANT ALL ON public.marketplace_price_history TO service_role;
ALTER TABLE public.marketplace_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Price history follows its listing" ON public.marketplace_price_history
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = listing_id));

CREATE OR REPLACE FUNCTION public.record_marketplace_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.marketplace_price_history (listing_id, price_cents) VALUES (NEW.id, NEW.price_cents);
  ELSIF NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
    INSERT INTO public.marketplace_price_history (listing_id, price_cents) VALUES (NEW.id, NEW.price_cents);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER marketplace_listings_price AFTER INSERT OR UPDATE OF price_cents ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.record_marketplace_price();

-- ============ WATCHES ============
CREATE TABLE public.marketplace_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_watches TO authenticated;
GRANT ALL ON public.marketplace_watches TO service_role;
ALTER TABLE public.marketplace_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players manage their own watchlist" ON public.marketplace_watches
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ SAVED SEARCHES ============
CREATE TABLE public.marketplace_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  label text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  notify boolean NOT NULL DEFAULT true,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_saved_searches TO authenticated;
GRANT ALL ON public.marketplace_saved_searches TO service_role;
ALTER TABLE public.marketplace_saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players manage their own saved searches" ON public.marketplace_saved_searches
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER marketplace_saved_searches_touch BEFORE UPDATE ON public.marketplace_saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ LOST & FOUND ============
CREATE TABLE public.lost_disc_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind lost_disc_kind NOT NULL,
  mold_name text NOT NULL,
  brand text,
  color text,
  weight_grams integer,
  ink_name text,
  ink_phone text,
  ink_pdga_number integer,
  course_id uuid REFERENCES public.courses ON DELETE SET NULL,
  hole_number integer,
  latitude double precision,
  longitude double precision,
  city text,
  state text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  reward text,
  handoff_notes text,
  photo_url text,
  status lost_disc_status NOT NULL DEFAULT 'open',
  reunited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lost_disc_reports_kind_idx ON public.lost_disc_reports (kind, status, occurred_on DESC);
CREATE INDEX lost_disc_reports_user_idx ON public.lost_disc_reports (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lost_disc_reports TO authenticated;
GRANT ALL ON public.lost_disc_reports TO service_role;
ALTER TABLE public.lost_disc_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read open reports" ON public.lost_disc_reports
  FOR SELECT TO authenticated USING (status <> 'closed' OR user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Players file their own reports" ON public.lost_disc_reports
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Players update their own reports" ON public.lost_disc_reports
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Players delete their own reports" ON public.lost_disc_reports
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER lost_disc_reports_touch BEFORE UPDATE ON public.lost_disc_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lost_disc_reports_state BEFORE INSERT OR UPDATE ON public.lost_disc_reports
  FOR EACH ROW EXECUTE FUNCTION public.normalize_state_column();

CREATE TABLE public.lost_disc_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.lost_disc_reports ON DELETE CASCADE,
  claimant_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  message text,
  conversation_id uuid REFERENCES public.conversations ON DELETE SET NULL,
  state lost_disc_claim_state NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, claimant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lost_disc_claims TO authenticated;
GRANT ALL ON public.lost_disc_claims TO service_role;
ALTER TABLE public.lost_disc_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Claims visible to both sides" ON public.lost_disc_claims
  FOR SELECT TO authenticated USING (
    claimant_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.lost_disc_reports r WHERE r.id = report_id AND r.user_id = auth.uid())
  );
CREATE POLICY "Players file their own claims" ON public.lost_disc_claims
  FOR INSERT TO authenticated WITH CHECK (claimant_id = auth.uid());
CREATE POLICY "Report owner or claimant updates a claim" ON public.lost_disc_claims
  FOR UPDATE TO authenticated USING (
    claimant_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.lost_disc_reports r WHERE r.id = report_id AND r.user_id = auth.uid())
  ) WITH CHECK (
    claimant_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.lost_disc_reports r WHERE r.id = report_id AND r.user_id = auth.uid())
  );
CREATE POLICY "Claimant withdraws a claim" ON public.lost_disc_claims
  FOR DELETE TO authenticated USING (claimant_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER lost_disc_claims_touch BEFORE UPDATE ON public.lost_disc_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MATCH FLAGS (private) ============
CREATE TABLE public.marketplace_match_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.marketplace_listings ON DELETE CASCADE,
  found_report_id uuid REFERENCES public.lost_disc_reports ON DELETE CASCADE,
  lost_report_id uuid NOT NULL REFERENCES public.lost_disc_reports ON DELETE CASCADE,
  lost_reporter_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status marketplace_flag_status NOT NULL DEFAULT 'open',
  reviewed_by uuid REFERENCES auth.users ON DELETE SET NULL,
  reviewed_at timestamptz,
  moderator_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_match_flags_subject CHECK (listing_id IS NOT NULL OR found_report_id IS NOT NULL)
);
CREATE UNIQUE INDEX marketplace_match_flags_listing_uq ON public.marketplace_match_flags (listing_id, lost_report_id) WHERE listing_id IS NOT NULL;
CREATE UNIQUE INDEX marketplace_match_flags_found_uq ON public.marketplace_match_flags (found_report_id, lost_report_id) WHERE found_report_id IS NOT NULL;
CREATE INDEX marketplace_match_flags_status_idx ON public.marketplace_match_flags (status, score DESC, created_at DESC);
GRANT SELECT, UPDATE ON public.marketplace_match_flags TO authenticated;
GRANT ALL ON public.marketplace_match_flags TO service_role;
ALTER TABLE public.marketplace_match_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Flags private to reporter and admins" ON public.marketplace_match_flags
  FOR SELECT TO authenticated USING (lost_reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins act on flags" ON public.marketplace_match_flags
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER marketplace_match_flags_touch BEFORE UPDATE ON public.marketplace_match_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SCORING ============
CREATE OR REPLACE FUNCTION public.score_lost_disc_match(
  _mold text, _color text, _weight integer, _ink_name text, _ink_pdga integer,
  _course uuid, _lat double precision, _lng double precision, _when date,
  _lost public.lost_disc_reports
) RETURNS TABLE(score integer, evidence jsonb)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  s integer := 0;
  ev jsonb := '{}'::jsonb;
  dist double precision;
BEGIN
  IF _mold IS NOT NULL AND _lost.mold_name IS NOT NULL
     AND public.normalize_course_name(_mold) = public.normalize_course_name(_lost.mold_name) THEN
    s := s + 30; ev := ev || jsonb_build_object('mold', _lost.mold_name);
  END IF;
  IF _color IS NOT NULL AND _lost.color IS NOT NULL AND lower(_color) = lower(_lost.color) THEN
    s := s + 15; ev := ev || jsonb_build_object('color', _lost.color);
  END IF;
  IF _weight IS NOT NULL AND _lost.weight_grams IS NOT NULL AND abs(_weight - _lost.weight_grams) <= 2 THEN
    s := s + 15; ev := ev || jsonb_build_object('weight', _lost.weight_grams);
  END IF;
  IF _ink_name IS NOT NULL AND _lost.ink_name IS NOT NULL AND lower(trim(_ink_name)) = lower(trim(_lost.ink_name)) THEN
    s := s + 40; ev := ev || jsonb_build_object('inkName', _lost.ink_name);
  END IF;
  IF _ink_pdga IS NOT NULL AND _lost.ink_pdga_number IS NOT NULL AND _ink_pdga = _lost.ink_pdga_number THEN
    s := s + 45; ev := ev || jsonb_build_object('inkPdga', _lost.ink_pdga_number);
  END IF;
  IF _course IS NOT NULL AND _lost.course_id IS NOT NULL AND _course = _lost.course_id THEN
    s := s + 20; ev := ev || jsonb_build_object('course', _lost.course_id);
  ELSIF _lat IS NOT NULL AND _lng IS NOT NULL AND _lost.latitude IS NOT NULL AND _lost.longitude IS NOT NULL THEN
    dist := 69.0 * sqrt(power(_lat - _lost.latitude, 2) + power((_lng - _lost.longitude) * cos(radians(_lat)), 2));
    IF dist <= 25 THEN
      s := s + 15; ev := ev || jsonb_build_object('milesApart', round(dist::numeric, 1));
    END IF;
  END IF;
  IF _when IS NOT NULL AND _lost.occurred_on IS NOT NULL AND _when >= _lost.occurred_on
     AND _when - _lost.occurred_on <= 60 THEN
    s := s + 10; ev := ev || jsonb_build_object('daysAfterLoss', _when - _lost.occurred_on);
  END IF;
  RETURN QUERY SELECT s, ev;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_lost_disc_matching(
  _listing_id uuid, _found_report_id uuid,
  _owner uuid, _mold text, _color text, _weight integer,
  _ink_name text, _ink_pdga integer, _course uuid,
  _lat double precision, _lng double precision, _when date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
  res record;
  forced boolean;
BEGIN
  FOR rec IN
    SELECT * FROM public.lost_disc_reports
    WHERE kind = 'lost' AND status IN ('open','matched') AND user_id <> _owner
  LOOP
    SELECT * INTO res FROM public.score_lost_disc_match(
      _mold, _color, _weight, _ink_name, _ink_pdga, _course, _lat, _lng, _when, rec
    );
    -- someone else's ink is always reviewed, whatever the score
    forced := (_ink_name IS NOT NULL AND rec.ink_name IS NOT NULL
                AND lower(trim(_ink_name)) = lower(trim(rec.ink_name)))
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

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        rec.user_id, 'system',
        'Possible match for your lost disc',
        'A ' || _mold || ' close to your lost disc just showed up nearby. Our team is reviewing it.',
        CASE WHEN _listing_id IS NOT NULL
          THEN '/marketplace/' || _listing_id::text
          ELSE '/marketplace/lost-found/' || _found_report_id::text END
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_match_marketplace_listing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.run_lost_disc_matching(
    NEW.id, NULL, NEW.seller_id, NEW.mold_name, NEW.color, NEW.weight_grams,
    NEW.ink_name, NEW.ink_pdga_number, NEW.course_id, NEW.latitude, NEW.longitude,
    CURRENT_DATE
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER marketplace_listings_match AFTER INSERT ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.trg_match_marketplace_listing();

CREATE OR REPLACE FUNCTION public.trg_match_found_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'found' THEN
    PERFORM public.run_lost_disc_matching(
      NULL, NEW.id, NEW.user_id, NEW.mold_name, NEW.color, NEW.weight_grams,
      NEW.ink_name, NEW.ink_pdga_number, NEW.course_id, NEW.latitude, NEW.longitude,
      NEW.occurred_on
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lost_disc_reports_match AFTER INSERT ON public.lost_disc_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_match_found_report();

-- ============ REUNITED COUNTER ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reunited_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.trg_lost_disc_reunited()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'reunited' AND OLD.status <> 'reunited' THEN
    NEW.reunited_at := COALESCE(NEW.reunited_at, now());
    UPDATE public.profiles SET reunited_count = reunited_count + 1 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lost_disc_reports_reunited BEFORE UPDATE ON public.lost_disc_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_lost_disc_reunited();