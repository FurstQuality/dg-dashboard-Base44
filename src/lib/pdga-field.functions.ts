/**
 * PDGA event field scraper.
 *
 * Scrapes the public event page (https://www.pdga.com/tour/event/<ref>) and
 * caches the roster into `public.pdga_event_field` so Game Plan can project
 * odds against real competitors and surface competition details.
 *
 * Works for completed events (results tables) and for events where PDGA has
 * already published the field ("Player" tab renders the same
 * `tournament-stats-N` result tables with rating + division data).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function fetchText(url: string): Promise<string> {
  const { fetchPdgaHtml } = await import("@/lib/pdga-fetch.server");
  return fetchPdgaHtml(url);
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type ParsedFieldRow = {
  event_ref: string;
  division: string | null;
  pdga_number: string;
  name: string;
  rating: number | null;
  place: number | null;
  total_to_par: number | null;
  total_strokes: number | null;
  prize: number | null;
  points: number | null;
};

export function parsePdgaEventField(html: string, eventRef: string): ParsedFieldRow[] {
  const rows: ParsedFieldRow[] = [];
  const tableRe =
    /<table class="results sticky-enabled" id="tournament-stats-\d+">([\s\S]*?)<\/table>/g;
  let m: RegExpExecArray | null;
  let cursor = 0;
  while ((m = tableRe.exec(html))) {
    // Division sources, in preference order:
    //   1. Registration/upcoming pages: <h3 class="division" id="MA1">…
    //   2. Completed-event pages: /live/event/<ref>/<DIV>" link
    // Both markers appear before their table in the DOM.
    const before = html.slice(cursor, m.index);
    cursor = m.index + m[0].length;
    const regMatches = [...before.matchAll(/<h3[^>]*class="division"[^>]*id="([A-Z0-9]+)"/g)];
    const liveMatches = [...before.matchAll(/\/live\/event\/[^/]+\/([A-Z0-9]+)"/g)];
    const division =
      (regMatches.length ? regMatches[regMatches.length - 1][1] : null) ??
      (liveMatches.length ? liveMatches[liveMatches.length - 1][1] : null);

    const body = m[1];
    const headMatch = body.match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    if (!headMatch) continue;
    const headers = [...headMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((h) =>
      cellText(h[1]).toLowerCase(),
    );
    const col = (needle: string) => headers.findIndex((h) => h.includes(needle));
    const idx = {
      place: col("place"),
      name: col("name"),
      pdga: col("pdga"),
      rating: col("rating"),
      par: col("par"),
      total: headers.lastIndexOf("total"),
      prize: col("prize"),
      points: col("points"),
    };
    if (idx.name < 0 || idx.pdga < 0) continue;

    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let r: RegExpExecArray | null;
    let first = true;
    while ((r = rowRe.exec(body))) {
      if (first) {
        first = false;
        continue;
      }
      const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
        cellText(c[1]),
      );
      if (!cells.length) continue;
      const pdga = cells[idx.pdga]?.replace(/\D/g, "") || "";
      const name = cells[idx.name] || "";
      if (!pdga || !name) continue;
      const num = (s: string | undefined) => {
        if (!s) return null;
        const cleaned = s.replace(/[^0-9.\-]/g, "");
        if (!cleaned || cleaned === "-" || cleaned === ".") return null;
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
      };
      rows.push({
        event_ref: eventRef,
        division,
        pdga_number: pdga,
        name,
        rating: idx.rating >= 0 ? num(cells[idx.rating]) : null,
        place: idx.place >= 0 ? num(cells[idx.place]) : null,
        total_to_par: idx.par >= 0 ? num(cells[idx.par]) : null,
        total_strokes: idx.total >= 0 ? num(cells[idx.total]) : null,
        prize: idx.prize >= 0 ? num(cells[idx.prize]) : null,
        points: idx.points >= 0 ? num(cells[idx.points]) : null,
      });
    }
  }
  return rows;
}

const Input = z.object({ eventRef: z.string().min(1) });

export const syncPdgaEventField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ref = data.eventRef.replace(/^pdga:/i, "").replace(/[^A-Za-z0-9-]/g, "");
    if (!ref) throw new Error("Invalid event reference");

    const html = await fetchText(`https://www.pdga.com/tour/event/${ref}`);
    const rows = parsePdgaEventField(html, ref);
    if (!rows.length) {
      return {
        eventRef: ref,
        inserted: 0,
        divisions: [] as string[],
        message: "No field data published yet for this event.",
      };
    }

    // Wipe & replace so late-drops disappear
    await supabaseAdmin.from("pdga_event_field").delete().eq("event_ref", ref);
    const { error } = await supabaseAdmin
      .from("pdga_event_field")
      .upsert(rows as never, { onConflict: "event_ref,pdga_number,division" });
    if (error) throw new Error(error.message);

    // Also refresh pdga_players cache so rating history knows about them.
    const playerRows = rows
      .filter((r) => r.rating != null)
      .map((r) => ({
        pdga_number: r.pdga_number,
        name: r.name,
        current_rating: r.rating,
        last_synced_at: new Date().toISOString(),
      }));
    if (playerRows.length) {
      await supabaseAdmin
        .from("pdga_players")
        .upsert(playerRows as never, { onConflict: "pdga_number" });
    }

    const divisions = Array.from(
      new Set(rows.map((r) => r.division).filter((d): d is string => !!d)),
    );
    return {
      eventRef: ref,
      inserted: rows.length,
      divisions,
      message: `Synced ${rows.length} players across ${divisions.length || 1} division(s).`,
    };
  });
