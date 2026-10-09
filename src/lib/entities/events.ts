import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTextMatch,
  buildWindowFilters,
  serverSearchTerm,
  EVENT_LIBRARY_LIMITS,
  type EventWindow,
} from "@/lib/events-library";

/**
 * Unified event type. Tournaments, leagues, and community events all live in
 * separate tables today; this hook wraps them behind a single shape so
 * consumers don't branch on table.
 */
export type EventKind = "tournament" | "league" | "community";

export type UnifiedEvent = {
  id: string;
  slug: string | null;
  event_type: EventKind;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  tier: string | null;
  owner_id: string | null;
};

/** Canonical read for a tournament / league / community event by id. */
export function eventQueryOptions(id: string | null | undefined, kind: EventKind) {
  return queryOptions({
    queryKey: ["event", kind, id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<UnifiedEvent | null> => {
      if (!id) return null;
      if (kind === "tournament") {
        const { data } = await supabase
          .from("tournaments")
          .select("id, slug, name, start_date, end_date, location, pdga_tier, owner_id")
          .eq("id", id)
          .maybeSingle();
        if (!data) return null;
        return {
          id: data.id,
          slug: data.slug ?? null,
          event_type: "tournament",
          title: data.name,
          starts_on: data.start_date ?? null,
          ends_on: data.end_date ?? null,
          location: data.location ?? null,
          tier: data.pdga_tier ?? null,
          owner_id: data.owner_id ?? null,
        };
      }
      if (kind === "league") {
        const { data } = await supabase
          .from("leagues")
          .select("id, slug, name, start_date, end_date, owner_id")
          .eq("id", id)
          .maybeSingle();
        if (!data) return null;
        return {
          id: data.id,
          slug: data.slug ?? null,
          event_type: "league",
          title: data.name,
          starts_on: data.start_date ?? null,
          ends_on: data.end_date ?? null,
          location: null,
          tier: null,
          owner_id: data.owner_id ?? null,
        };
      }
      const { data } = await supabase
        .from("community_events")
        .select("id, title, starts_at, ends_at, location, host_id")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        slug: null,
        event_type: "community",
        title: data.title,
        starts_on: data.starts_at ?? null,
        ends_on: data.ends_at ?? null,
        location: data.location ?? null,
        tier: null,
        owner_id: data.host_id ?? null,
      };
    },
  });
}

export type TournamentListRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  start_date: string;
  end_date: string;
  location: string | null;
  pdga_sanctioned: boolean;
  pdga_tier: string | null;
  cover_url: string | null;
  latitude: number | null;
  longitude: number | null;
  signup_type: string | null;
  registration_url: string | null;
};

/**
 * Coarse server-side narrowing for event list reads. The event library passes
 * its active date window and text query so the browser only receives rows it
 * could plausibly display; finer facets stay client-side.
 */
export type EventListFilters = {
  window?: EventWindow;
  /** Raw user query; short fragments are ignored and filtered locally. */
  q?: string | null;
};

/** In-app tournaments (non-draft), sorted by start date ascending. */
export function tournamentsListQueryOptions(limit = 100, filters: EventListFilters = {}) {
  const window = filters.window ?? { startFrom: null, startTo: null };
  const term = serverSearchTerm(filters.q);
  return queryOptions({
    queryKey: ["tournaments", "list", { limit, window, term }],
    staleTime: 30_000,
    queryFn: async (): Promise<TournamentListRow[]> => {
      let query = supabase
        .from("tournaments")
        .select(
          "id, name, slug, status, start_date, end_date, location, pdga_sanctioned, pdga_tier, cover_url, latitude, longitude, signup_type, registration_url",
        )
        .neq("status", "draft");

      const { orExpr, startTo } = buildWindowFilters(window, {
        start: "start_date",
        end: "end_date",
      });
      if (orExpr) query = query.or(orExpr);
      if (startTo) query = query.lte("start_date", startTo);
      const textMatch = buildTextMatch(term, ["name", "location"]);
      if (textMatch) query = query.or(textMatch);

      const { data, error } = await query.order("start_date", { ascending: true }).limit(limit);
      if (error) throw error;
      return (data as TournamentListRow[]) ?? [];
    },
  });
}

export type LeagueListRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  season: string | null;
  status: string;
};

/** One scheduled night of a league, so the directory can list it by date. */
export type LeagueNightRow = {
  id: string;
  league_id: string;
  event_date: string;
  week_number: number;
  name: string | null;
  status: string;
};

/**
 * Nights for every published league. Leagues are season containers, so the
 * directory lists their nights instead of the season as one long event.
 */
export function leagueNightsQueryOptions() {
  return queryOptions({
    queryKey: ["leagues", "nights", "directory"],
    staleTime: 30_000,
    queryFn: async (): Promise<LeagueNightRow[]> => {
      const { data, error } = await supabase
        .from("league_events")
        .select("id, league_id, event_date, week_number, name, status")
        .order("event_date", { ascending: true })
        .limit(3000);
      if (error) throw error;
      return (data as LeagueNightRow[]) ?? [];
    },
  });
}

/** Published leagues, sorted by creation newest first. */
export function leaguesListQueryOptions(filters: EventListFilters = {}) {
  const term = serverSearchTerm(filters.q);
  return queryOptions({
    queryKey: ["leagues", "list", { term }],
    staleTime: 30_000,
    queryFn: async (): Promise<LeagueListRow[]> => {
      let query = supabase
        .from("leagues")
        .select("id, name, slug, description, season, status")
        .neq("status", "draft");
      // Leagues are season containers without a single date column, so only the
      // text query narrows them server-side.
      const textMatch = buildTextMatch(term, ["name", "season"]);
      if (textMatch) query = query.or(textMatch);
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(EVENT_LIBRARY_LIMITS.leagues);
      if (error) throw error;
      return (data as LeagueListRow[]) ?? [];
    },
  });
}
