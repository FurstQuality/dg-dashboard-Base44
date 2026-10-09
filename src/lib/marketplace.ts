/**
 * Local marketplace — buy, sell, and trade discs with players nearby.
 *
 * All reads and writes go through the browser Supabase client so row level
 * security decides what a player can see and change (the same approach Arena
 * and DGIM use). Match flagging happens in the database on insert, so nothing
 * here can skip it.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeStateCode, stateFilterVariants } from "@/lib/us-states";

export type ListingStatus = "active" | "reserved" | "sold" | "removed";
export type ListingSort = "newest" | "nearest" | "cheapest";

export type MarketplaceSeller = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  location: string | null;
  home_state: string | null;
};

export type MarketplaceListing = {
  id: string;
  seller_id: string;
  mold_id: string | null;
  plastic_id: string | null;
  user_disc_id: string | null;
  brand: string | null;
  mold_name: string;
  plastic_name: string | null;
  disc_type: string | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  color: string | null;
  weight_grams: number | null;
  condition: string | null;
  ink_notes: string | null;
  ink_name: string | null;
  ink_pdga_number: number | null;
  description: string | null;
  price_cents: number | null;
  trade_only: boolean;
  status: ListingStatus;
  course_id: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  view_count: number;
  bumped_at: string;
  sold_at: string | null;
  created_at: string;
  seller: MarketplaceSeller | null;
  photos: { id: string; url: string; sort_order: number }[];
};

export type ListingFilters = {
  search?: string;
  brand?: string;
  discType?: string;
  condition?: string;
  state?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  tradeOnly?: boolean;
  radiusMiles?: number;
  origin?: { lat: number; lng: number } | null;
  sort?: ListingSort;
  page?: number;
  pageSize?: number;
};

const LISTING_SELECT = `
  id, seller_id, mold_id, plastic_id, user_disc_id, brand, mold_name, plastic_name,
  disc_type, speed, glide, turn, fade, color, weight_grams, condition, ink_notes,
  ink_name, ink_pdga_number, description, price_cents, trade_only, status, course_id,
  latitude, longitude, city, state, view_count, bumped_at, sold_at, created_at,
  photos:marketplace_listing_photos(id, url, sort_order)
`;

/**
 * Profiles are not joinable from these tables (their owner columns reference
 * auth users), so seller and reporter cards are hydrated in a second read —
 * the same approach the feed uses.
 */
export async function fetchProfileMap(
  ids: string[],
): Promise<Record<string, MarketplaceSeller>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, location, home_state")
    .in("id", unique);
  if (error) throw error;
  const map: Record<string, MarketplaceSeller> = {};
  for (const row of (data ?? []) as MarketplaceSeller[]) map[row.id] = row;
  return map;
}

/** Straight-line distance in miles — good enough for "near me" filtering. */
export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = a.lat - b.lat;
  const dLng = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return 69 * Math.sqrt(dLat * dLat + dLng * dLng);
}

export function formatPrice(cents: number | null, tradeOnly: boolean): string {
  if (tradeOnly) return "Trade only";
  if (cents === null) return "Make an offer";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function listingLocation(listing: {
  city: string | null;
  state: string | null;
}): string | null {
  const parts = [listing.city, listing.state].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function sortRows(
  rows: MarketplaceListing[],
  sort: ListingSort,
  origin: { lat: number; lng: number } | null | undefined,
): MarketplaceListing[] {
  const copy = [...rows];
  if (sort === "cheapest") {
    return copy.sort(
      (a, b) => (a.price_cents ?? Number.MAX_SAFE_INTEGER) - (b.price_cents ?? Number.MAX_SAFE_INTEGER),
    );
  }
  if (sort === "nearest" && origin) {
    return copy.sort((a, b) => {
      const da =
        a.latitude != null && a.longitude != null
          ? milesBetween(origin, { lat: a.latitude, lng: a.longitude })
          : Number.MAX_SAFE_INTEGER;
      const db =
        b.latitude != null && b.longitude != null
          ? milesBetween(origin, { lat: b.latitude, lng: b.longitude })
          : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }
  return copy.sort((a, b) => b.bumped_at.localeCompare(a.bumped_at));
}

export async function fetchListings(
  filters: ListingFilters,
): Promise<{ rows: MarketplaceListing[]; total: number }> {
  const pageSize = filters.pageSize ?? 24;
  const page = filters.page ?? 0;

  let query = supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT, { count: "exact" })
    .in("status", ["active", "reserved"]);

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`mold_name.ilike.${term},brand.ilike.${term},description.ilike.${term}`);
  }
  if (filters.brand) query = query.eq("brand", filters.brand);
  if (filters.discType) query = query.eq("disc_type", filters.discType);
  if (filters.condition) query = query.eq("condition", filters.condition as never);
  if (filters.city?.trim()) query = query.ilike("city", filters.city.trim());
  if (filters.state?.trim()) {
    const variants = stateFilterVariants(filters.state.trim());
    query = query.in("state", variants.length ? variants : [filters.state.trim()]);
  }
  if (typeof filters.minPrice === "number") query = query.gte("price_cents", filters.minPrice * 100);
  if (typeof filters.maxPrice === "number") query = query.lte("price_cents", filters.maxPrice * 100);
  if (filters.tradeOnly) query = query.eq("trade_only", true);

  // Radius filtering needs coordinates on both sides, so it is applied after
  // the fetch; everything else narrows server-side.
  const wideFetch = Boolean(filters.radiusMiles && filters.origin);
  const from = wideFetch ? 0 : page * pageSize;
  const to = wideFetch ? 199 : from + pageSize - 1;

  const { data, error, count } = await query
    .order("bumped_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  let rows = ((data ?? []) as unknown as MarketplaceListing[]).map((row) => ({
    ...row,
    photos: [...(row.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));

  if (wideFetch && filters.origin && filters.radiusMiles) {
    const origin = filters.origin;
    rows = rows.filter(
      (r) =>
        r.latitude != null &&
        r.longitude != null &&
        milesBetween(origin, { lat: r.latitude, lng: r.longitude }) <= filters.radiusMiles!,
    );
  }

  rows = sortRows(rows, filters.sort ?? "newest", filters.origin);
  const sellers = await fetchProfileMap(rows.map((r) => r.seller_id));
  rows = rows.map((r) => ({ ...r, seller: sellers[r.seller_id] ?? null }));
  const total = wideFetch ? rows.length : (count ?? rows.length);
  if (wideFetch) rows = rows.slice(page * pageSize, page * pageSize + pageSize);
  return { rows, total };
}

export function listingsQueryOptions(filters: ListingFilters) {
  return queryOptions({
    queryKey: ["marketplace-listings", filters] as const,
    queryFn: () => fetchListings(filters),
    staleTime: 30_000,
  });
}

export async function fetchListing(id: string): Promise<MarketplaceListing | null> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as MarketplaceListing;
  const sellers = await fetchProfileMap([row.seller_id]);
  return {
    ...row,
    seller: sellers[row.seller_id] ?? null,
    photos: [...(row.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}

export function listingQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["marketplace-listing", id] as const,
    queryFn: () => fetchListing(id),
    staleTime: 15_000,
  });
}

export type PricePoint = { id: string; price_cents: number | null; changed_at: string };

export async function fetchPriceHistory(listingId: string): Promise<PricePoint[]> {
  const { data, error } = await supabase
    .from("marketplace_price_history")
    .select("id, price_cents, changed_at")
    .eq("listing_id", listingId)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PricePoint[];
}

export function priceHistoryQueryOptions(listingId: string) {
  return queryOptions({
    queryKey: ["marketplace-price-history", listingId] as const,
    queryFn: () => fetchPriceHistory(listingId),
    staleTime: 60_000,
  });
}

export async function fetchMyListings(userId: string): Promise<MarketplaceListing[]> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select(LISTING_SELECT)
    .eq("seller_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const sellers = await fetchProfileMap([userId]);
  return ((data ?? []) as unknown as MarketplaceListing[]).map((row) => ({
    ...row,
    seller: sellers[userId] ?? null,
    photos: [...(row.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export function myListingsQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["marketplace-my-listings", userId] as const,
    queryFn: () => fetchMyListings(userId as string),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

export type NewListingInput = {
  moldId?: string | null;
  plasticId?: string | null;
  userDiscId?: string | null;
  brand?: string | null;
  moldName: string;
  plasticName?: string | null;
  discType?: string | null;
  speed?: number | null;
  glide?: number | null;
  turn?: number | null;
  fade?: number | null;
  color?: string | null;
  weightGrams?: number | null;
  condition?: string | null;
  inkNotes?: string | null;
  inkName?: string | null;
  inkPdgaNumber?: number | null;
  description?: string | null;
  priceCents?: number | null;
  tradeOnly: boolean;
  courseId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
};

export async function createListing(sellerId: string, input: NewListingInput): Promise<string> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert({
      seller_id: sellerId,
      mold_id: input.moldId ?? null,
      plastic_id: input.plasticId ?? null,
      user_disc_id: input.userDiscId ?? null,
      brand: input.brand ?? null,
      mold_name: input.moldName,
      plastic_name: input.plasticName ?? null,
      disc_type: input.discType ?? null,
      speed: input.speed ?? null,
      glide: input.glide ?? null,
      turn: input.turn ?? null,
      fade: input.fade ?? null,
      color: input.color ?? null,
      weight_grams: input.weightGrams ?? null,
      condition: (input.condition ?? null) as never,
      ink_notes: input.inkNotes ?? null,
      ink_name: input.inkName ?? null,
      ink_pdga_number: input.inkPdgaNumber ?? null,
      description: input.description ?? null,
      price_cents: input.tradeOnly ? null : (input.priceCents ?? null),
      trade_only: input.tradeOnly,
      course_id: input.courseId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      city: input.city ?? null,
      state: normalizeStateCode(input.state) ?? input.state ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateListingPrice(listingId: string, priceCents: number | null) {
  const { error } = await supabase
    .from("marketplace_listings")
    .update({ price_cents: priceCents })
    .eq("id", listingId);
  if (error) throw error;
}

export async function setListingStatus(
  listingId: string,
  status: ListingStatus,
  soldToUserId?: string | null,
) {
  const patch =
    status === "sold"
      ? { status, sold_at: new Date().toISOString(), sold_to_user_id: soldToUserId ?? null }
      : { status };
  const { error } = await supabase.from("marketplace_listings").update(patch).eq("id", listingId);
  if (error) throw error;
}

export async function bumpListing(listingId: string) {
  const { error } = await supabase
    .from("marketplace_listings")
    .update({ bumped_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) throw error;
}

/** Uploads a listing photo and returns a long-lived signed URL. */
export async function uploadMarketplacePhoto(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("marketplace").upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("marketplace")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (!data?.signedUrl) throw new Error("Photo uploaded, but we couldn't build a link for it.");
  return data.signedUrl;
}

export async function addListingPhoto(
  listingId: string,
  userId: string,
  url: string,
  sortOrder: number,
) {
  const { error } = await supabase
    .from("marketplace_listing_photos")
    .insert({ listing_id: listingId, user_id: userId, url, sort_order: sortOrder });
  if (error) throw error;
}

// ── Watchlist ───────────────────────────────────────────────────────────────

export async function fetchWatchedListingIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("marketplace_watches")
    .select("listing_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.listing_id);
}

export function watchlistQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["marketplace-watchlist", userId] as const,
    queryFn: () => fetchWatchedListingIds(userId as string),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export async function toggleWatch(userId: string, listingId: string, watched: boolean) {
  if (watched) {
    const { error } = await supabase
      .from("marketplace_watches")
      .delete()
      .eq("user_id", userId)
      .eq("listing_id", listingId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("marketplace_watches")
    .insert({ user_id: userId, listing_id: listingId });
  if (error) throw error;
}

// ── Saved searches ──────────────────────────────────────────────────────────

export type SavedSearch = {
  id: string;
  label: string;
  filters: ListingFilters;
  notify: boolean;
  created_at: string;
};

export async function fetchSavedSearches(userId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from("marketplace_saved_searches")
    .select("id, label, filters, notify, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as SavedSearch[]).map((row) => ({
    ...row,
    filters: (row.filters ?? {}) as ListingFilters,
  }));
}

export function savedSearchesQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["marketplace-saved-searches", userId] as const,
    queryFn: () => fetchSavedSearches(userId as string),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
}

export async function createSavedSearch(userId: string, label: string, filters: ListingFilters) {
  const { error } = await supabase
    .from("marketplace_saved_searches")
    .insert({ user_id: userId, label, filters: filters as never });
  if (error) throw error;
}

export async function setSavedSearchNotify(id: string, notify: boolean) {
  const { error } = await supabase
    .from("marketplace_saved_searches")
    .update({ notify })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSavedSearch(id: string) {
  const { error } = await supabase.from("marketplace_saved_searches").delete().eq("id", id);
  if (error) throw error;
}

/** Counts listings that match a saved search — powers the alerts screen. */
export async function countMatches(filters: ListingFilters): Promise<number> {
  const { total } = await fetchListings({ ...filters, page: 0, pageSize: 1 });
  return total;
}

// ── Moderation ──────────────────────────────────────────────────────────────

export type MatchFlag = {
  id: string;
  listing_id: string | null;
  found_report_id: string | null;
  lost_report_id: string;
  lost_reporter_id: string;
  score: number;
  evidence: Record<string, unknown>;
  status: "open" | "dismissed" | "warned" | "hidden" | "connected";
  moderator_notes: string | null;
  created_at: string;
};

export async function fetchMatchFlags(status?: MatchFlag["status"]): Promise<MatchFlag[]> {
  let query = supabase
    .from("marketplace_match_flags")
    .select(
      "id, listing_id, found_report_id, lost_report_id, lost_reporter_id, score, evidence, status, moderator_notes, created_at",
    )
    .order("score", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MatchFlag[];
}

export function matchFlagsQueryOptions(status?: MatchFlag["status"]) {
  return queryOptions({
    queryKey: ["marketplace-match-flags", status ?? "all"] as const,
    queryFn: () => fetchMatchFlags(status),
    staleTime: 15_000,
  });
}

export async function resolveMatchFlag(
  id: string,
  status: MatchFlag["status"],
  notes: string | null,
  reviewerId: string,
) {
  const { error } = await supabase
    .from("marketplace_match_flags")
    .update({
      status,
      moderator_notes: notes,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
