/**
 * Weekly league schedule.
 *
 * Local leagues repeat on the same weekday, so the directory mirror is collapsed
 * into one row per league series: the weekday it plays, who hosts it, where, and
 * the next date on the calendar. Reads come from the mirrored PDGA, Disc Golf
 * Scene and UDisc listings plus leagues organized inside the app.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LeagueSource = "pdga" | "disc_golf_scene" | "udisc" | "chainlink";

export type LeagueNight = {
  /** Stable key for the series (weekday + normalized name). */
  key: string;
  /** 0 = Sunday … 6 = Saturday, or null when no date is known. */
  weekday: number | null;
  name: string;
  /** Club or organizer that hosts the night, when the listing names one. */
  host: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  /** Venue coordinates when the listing carries them, for distance filtering. */
  latitude: number | null;
  longitude: number | null;
  source: LeagueSource;
  url: string | null;
  /** Next scheduled date for the series, ISO yyyy-mm-dd. */
  next_date: string | null;
  /** How many dates for this series are on the calendar ahead. */
  upcoming_count: number;
  /** True when the series has three or more dated occurrences — a real weekly. */
  recurring: boolean;
};

export type LeagueScheduleFeed = {
  nights: LeagueNight[];
  states: string[];
  total: number;
};

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayLabel(weekday: number | null): string {
  return weekday == null ? "Day varies" : WEEKDAY_LABELS[weekday];
}

const filterSchema = z
  .object({
    state: z.string().max(4).optional().nullable(),
    /** Look this many days ahead for scheduled league dates. */
    horizonDays: z.number().int().min(7).max(180).optional().nullable(),
  })
  .default({});

/** Normalizes a league title so weekly occurrences collapse into one series. */
function seriesName(name: string): string {
  return name
    .replace(/\b(week|wk|round|rd|night|day)\s*#?\d+\b/gi, "")
    .replace(/#\d+/g, "")
    .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, "")
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\s*[-–:|]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Pulls a likely club/organizer name out of a league title. */
function hostFromName(name: string): string | null {
  const dash = name.split(/\s+[-–|]\s+/);
  if (dash.length > 1) {
    const candidate = dash[0].trim();
    if (candidate.length >= 3 && candidate.length <= 48) return candidate;
  }
  const club = name.match(/([A-Z][\w'.]*(?:\s+[A-Z][\w'.]*){0,3}\s+(?:Disc Golf Club|DGC|Club))/);
  return club ? club[1].trim() : null;
}

function weekdayOf(iso: string | null): number | null {
  if (!iso || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d.getUTCDay();
}

type DirectoryLeagueRow = {
  id: string;
  source: LeagueSource;
  url: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const listLeagueSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => filterSchema.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<LeagueScheduleFeed> => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + (data.horizonDays ?? 60));
    const until = horizon.toISOString().slice(0, 10);

    let query = supabase
      .from("event_directory")
      .select("id, source, url, name, start_date, end_date, venue_name, city, state, latitude, longitude")
      .eq("kind", "league")
      .gte("start_date", today)
      .lte("start_date", until);
    if (data.state) query = query.eq("state", data.state.toUpperCase());

    const { data: rows, error } = await query
      .order("start_date", { ascending: true })
      .limit(2000);
    if (error) throw new Error("We couldn't load the league schedule just now. Try again shortly.");

    const series = new Map<string, LeagueNight>();
    const states = new Set<string>();

    for (const row of (rows ?? []) as DirectoryLeagueRow[]) {
      const weekday = weekdayOf(row.start_date);
      const clean = seriesName(row.name) || row.name;
      const key = `${weekday ?? "x"}|${clean.toLowerCase()}|${(row.venue_name ?? row.city ?? "").toLowerCase()}`;
      if (row.state) states.add(row.state.toUpperCase());

      const existing = series.get(key);
      if (existing) {
        existing.upcoming_count += 1;
        existing.recurring = existing.upcoming_count >= 3;
        if (row.start_date && (!existing.next_date || row.start_date < existing.next_date)) {
          existing.next_date = row.start_date;
        }
        existing.venue_name ??= row.venue_name;
        existing.city ??= row.city;
        existing.state ??= row.state;
        existing.latitude ??= row.latitude;
        existing.longitude ??= row.longitude;
        existing.url ??= row.url;
        continue;
      }

      series.set(key, {
        key,
        weekday,
        name: clean,
        host: hostFromName(clean),
        venue_name: row.venue_name,
        city: row.city,
        state: row.state,
        latitude: row.latitude,
        longitude: row.longitude,
        source: row.source,
        url: row.url,
        next_date: row.start_date,
        upcoming_count: 1,
        recurring: false,
      });
    }

    const nights = Array.from(series.values()).sort((a, b) => {
      const dayA = a.weekday ?? 7;
      const dayB = b.weekday ?? 7;
      if (dayA !== dayB) return dayA - dayB;
      if (a.recurring !== b.recurring) return a.recurring ? -1 : 1;
      return (a.next_date ?? "9999").localeCompare(b.next_date ?? "9999");
    });

    return {
      nights,
      states: Array.from(states).sort(),
      total: nights.length,
    };
  });

/** One dated league occurrence, for the app-wide league calendar. */
export type LeagueOccurrence = {
  id: string;
  name: string;
  source: LeagueSource;
  url: string | null;
  start_date: string;
  end_date: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type LeagueCalendarFeed = {
  occurrences: LeagueOccurrence[];
  /** Leagues in the directory that still have no date attached. */
  undated: number;
  /** How many dated occurrences each source contributed to the window. */
  bySource: Record<LeagueSource, number>;
};

const calendarSchema = z.object({
  /** Inclusive window, ISO yyyy-mm-dd. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().length(10),
});

/**
 * Every league on the calendar across the whole app — the mirrored PDGA, Disc
 * Golf Scene and UDisc listings — for one month window, with no area or
 * distance filtering.
 */
export const listLeagueCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => calendarSchema.parse(raw))
  .handler(async ({ data, context }): Promise<LeagueCalendarFeed> => {
    const { supabase } = context;

    const [listing, undatedCount] = await Promise.all([
      supabase
        .from("event_directory")
        .select(
          "id, source, url, name, start_date, end_date, venue_name, city, state, latitude, longitude",
        )
        .eq("kind", "league")
        .not("start_date", "is", null)
        .lte("start_date", data.to)
        .or(`end_date.gte.${data.from},and(end_date.is.null,start_date.gte.${data.from})`)
        .order("start_date", { ascending: true })
        .limit(3000),
      supabase
        .from("event_directory")
        .select("id", { count: "exact", head: true })
        .eq("kind", "league")
        .is("start_date", null),
    ]);

    if (listing.error)
      throw new Error("We couldn't load the league calendar just now. Try again shortly.");

    const bySource: Record<LeagueSource, number> = {
      pdga: 0,
      disc_golf_scene: 0,
      udisc: 0,
      chainlink: 0,
    };
    const occurrences: LeagueOccurrence[] = [];
    type CalendarRow = DirectoryLeagueRow & { start_date: string };
    for (const row of (listing.data ?? []) as CalendarRow[]) {
      bySource[row.source] = (bySource[row.source] ?? 0) + 1;
      occurrences.push({
        id: row.id,
        name: row.name,
        source: row.source,
        url: row.url,
        start_date: row.start_date,
        end_date: row.end_date,
        venue_name: row.venue_name,
        city: row.city,
        state: row.state,
        latitude: row.latitude,
        longitude: row.longitude,
      });
    }

    return { occurrences, undated: undatedCount.count ?? 0, bySource };
  });

