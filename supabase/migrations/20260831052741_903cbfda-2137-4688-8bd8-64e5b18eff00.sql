-- 1. profiles: remove blanket table-level SELECT that superseded column revokes
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- Authenticated users may read every non-secret column.
GRANT SELECT (
  id, username, display_name, bio, avatar_url, cover_url, home_course, location,
  pdga_number, pdga_rating, bag, created_at, updated_at, home_state, player_since,
  favorite_ace, ace_count_manual, calendar_shared_with_friends, preferred_division,
  pdga_profile_url, scene_profile_url, udisc_profile_url, scene_profile_urls,
  reunited_count, player_code
) ON public.profiles TO authenticated;

-- Anonymous visitors only get the public profile card fields.
GRANT SELECT (
  id, username, display_name, bio, avatar_url, cover_url, home_course,
  pdga_number, pdga_rating, created_at, updated_at, player_since,
  favorite_ace, ace_count_manual
) ON public.profiles TO anon;

-- Secrets stay service-role only: ics_feed_token, qr_token,
-- notification_prefs, privacy_prefs are intentionally not granted above.
REVOKE UPDATE (ics_feed_token, qr_token) ON public.profiles FROM anon;
REVOKE UPDATE (ics_feed_token, qr_token) ON public.profiles FROM authenticated;

-- 2. marketplace child tables: mirror the listing visibility rule
DROP POLICY IF EXISTS "Photos follow their listing" ON public.marketplace_listing_photos;
CREATE POLICY "Photos follow their listing"
  ON public.marketplace_listing_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings l
      WHERE l.id = marketplace_listing_photos.listing_id
        AND (
          l.status <> 'removed'::marketplace_listing_status
          OR l.seller_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "Price history follows its listing" ON public.marketplace_price_history;
CREATE POLICY "Price history follows its listing"
  ON public.marketplace_price_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_listings l
      WHERE l.id = marketplace_price_history.listing_id
        AND (
          l.status <> 'removed'::marketplace_listing_status
          OR l.seller_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );