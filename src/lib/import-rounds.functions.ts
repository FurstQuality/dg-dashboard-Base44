import { validUdiscRating } from "./udisc-eligibility";
import { isTeamPlayerName } from "@/lib/udisc-team-name";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { agreedPar, parsePdgaDetailPage, pdgaRoundIssues } from "@/lib/dgd-v1/pdga-details";
import Papa from "papaparse";
import { classifyUdiscRound } from "@/lib/udisc-eligibility";
import {
  makeAliasMatcher,
  normalizeAlias,
  parseAliases,
  shouldRejectAmbiguousPlayerNames,
} from "@/lib/player-aliases";

/** Shared row shape we write to `external_rounds`. */
type ExternalRoundInsert = {
  user_id: string;
  source: "udisc" | "pdga" | "manual";
  course_name: string;
  layout_name: string | null;
  event_name: string | null;
  played_on: string; // ISO date
  score: number | null;
  to_par: number | null;
  round_rating: number | null;
  ssa: number | null;
  notes: string | null;
  format?: "singles" | "doubles" | "team" | "other";
  division?: string | null;
  included?: boolean | null;
  evaluated_on?: string | null;
};

/** Heuristic: classify a round as singles / doubles / team from text hints. */
function detectFormat(fields: {
  event_name?: string | null;
  layout_name?: string | null;
  course_name?: string | null;
  notes?: string | null;
  division?: string | null;
}): "singles" | "doubles" | "team" {
  const hay = [
    fields.event_name,
    fields.layout_name,
    fields.course_name,
    fields.notes,
    fields.division,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return "singles";
  if (/\bteam\b|4[- ]person|3[- ]person|team[- ]scramble/.test(hay)) return "team";
  if (
    /\bdoubles?\b|\bdubs\b|best\s*shot|worst\s*shot|captain'?s?\s*choice|alt(ernate)?\s*shot|\bscramble\b|^dou/i.test(
      hay,
    )
  )
    return "doubles";
  return "singles";
}

/* ------------------------------------------------------------------ */
/* UDisc CSV import                                                    */
/* ------------------------------------------------------------------ */
/**
 * UDisc exports one row per player per hole (long format) OR one row per
 * scorecard with per-hole columns (wide format). The public web export at
 * udisc.com uses the wide format:
 *   PlayerName, CourseName, LayoutName, Date, Total, +/-, Hole1, Hole2, ...
 *
 * We keep the row for the current user only (by matching against a name the
 * user gives us) and derive score / to_par from the Total and +/- columns.
 */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // "2024-06-14 13:22" | "6/14/2024" | "2024-06-14"
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (us) {
    const yr = us[3].length === 2 ? `20${us[3]}` : us[3];
    const m = us[1].padStart(2, "0");
    const d = us[2].padStart(2, "0");
    return `${yr}-${m}-${d}`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

function pickNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export const importUDiscCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        csvText: z.string().min(10).max(2_000_000),
        /** One or several spellings, comma/newline separated. */
        playerName: z.string().trim().min(1).max(400).optional(),
        /** Same thing as a list — names, handles, or a PDGA number. */
        playerNames: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
        /** Exact player-column values the user explicitly confirmed belong to them. */
        confirmedPlayerNames: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
        maxInsert: z.number().int().min(1).max(200).optional(),
      })
      .parse(raw),
  )

  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Strip UTF-8 BOM if present so header lookups don't miss the first column.
    const csvText = data.csvText.replace(/^\uFEFF/, "");
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length && parsed.data.length === 0) {
      throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
    }

    // Normalize keys once: lowercase + strip whitespace, BOM, punctuation like "/", "+", "-", "_".
    const normKey = (k: string) =>
      k
        .replace(/^\uFEFF/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const rawHeaders = (parsed.meta.fields ?? []).map((f) => f ?? "");
    const headerMap = new Map<string, string>(); // normalized -> original
    for (const h of rawHeaders) headerMap.set(normKey(h), h);

    let rows: (ExternalRoundInsert & {
      _group?: string;
      _player?: string;
      _holes?: { number: number; strokes: number }[];
    })[] = [];

    // Detect Hole1..HoleN columns from the header map (wide-format UDisc export).
    const holeCols: { number: number; original: string }[] = [];
    for (const [nk, original] of headerMap.entries()) {
      const m = /^hole(\d{1,2})$/.exec(nk);
      if (m) holeCols.push({ number: Number(m[1]), original });
    }
    holeCols.sort((a, b) => a.number - b.number);
    // Par values captured from the per-scorecard "Par" row, keyed by group.
    const parByGroup = new Map<string, Map<number, number>>();
    // Which rows are the caller's? UDisc CSVs are group scorecards — one row per
    // player — so without a name filter every friend's round lands in the user's
    // history. People spell themselves several ways ("Michael Furst", "Furst",
    // "furst93", their PDGA number), so we accept a list and match all of them.
    const requestedAliases = parseAliases([
      ...(data.playerNames ?? []),
      ...parseAliases(data.playerName ?? ""),
    ]);
    let aliases = requestedAliases;
    if (aliases.length === 0) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, username, pdga_number")
        .eq("id", userId)
        .maybeSingle();
      aliases = parseAliases([
        prof?.display_name ?? "",
        prof?.username ?? "",
        prof?.pdga_number ? String(prof.pdga_number) : "",
      ]);
    }
    const hasFilter = aliases.length > 0;
    const matchesAlias = makeAliasMatcher(aliases);
    // Exact alias matching only — "Furst" never matches "Jane Furst".
    const exactAliases = new Set(aliases.map((a) => normalizeAlias(a)));
    const confirmedNames = new Set(
      parseAliases(data.confirmedPlayerNames ?? []).map((name) => normalizeAlias(name)),
    );

    const skips = {
      par_row: 0,
      name_mismatch: 0,
      missing_course: 0,
      missing_date: 0,
      empty_row: 0,
      solo_group: 0,
      doubles_group: 0,
      unfinished: 0,
    };

    const playersSeen = new Map<string, number>();
    // group key -> distinct player names seen in that scorecard
    const groupPlayers = new Map<string, Set<string>>();
    // group key -> map(player -> "score|toPar"), used to infer doubles when
    // 2+ players in the same scorecard share an identical result (best-shot).
    const groupScores = new Map<string, Map<string, string>>();

    // Helpers that operate on a normalized row.
    const dateKeys = [
      "date",
      "startdate",
      "enddate",
      "played",
      "playeddate",
      "roundstart",
      "roundend",
      "playedon",
    ];
    const courseKeys = ["coursename", "course"];
    const playerKeys = ["playername", "player", "name"];
    const layoutKeys = ["layoutname", "layout"];
    const totalKeys = ["total", "totalscore", "strokes"];
    const toParKeys = ["", "plusminus", "topar", "toPar"].concat(["+/-"]);
    const ratingKeys = ["roundrating", "rating", "udiscrating", "playerrating"];
    const ssaKeys = ["ssa", "scratchscoringaverage", "scratchrating"];
    const formatKeys = [
      "format",
      "roundformat",
      "playformat",
      "type",
      "roundtype",
      "scoringformat",
    ];

    const getFrom = (row: Record<string, string>, wants: string[]): string => {
      for (const want of wants) {
        const original = headerMap.get(normKey(want));
        if (original != null) {
          const v = row[original];
          if (v != null && String(v).trim() !== "") return String(v).trim();
        }
      }
      return "";
    };

    // UDisc exports are block-structured: a "Par" row starts one scorecard and
    // every row until the next "Par" row is a player/team on that same card.
    const playerOf = (row: Record<string, string>) => getFrom(row, playerKeys);
    const blockOf: number[] = [];
    const teamBlocks = new Set<number>();
    {
      let block = -1;
      for (const row of parsed.data) {
        const p = playerOf(row);
        if (p.toLowerCase() === "par") block++;
        else if (block >= 0 && isTeamPlayerName(p)) teamBlocks.add(block);
        blockOf.push(block);
      }
    }

    for (const [ri, r] of parsed.data.entries()) {
      const blockIdx = blockOf[ri] ?? -1;
      const bk = blockIdx >= 0 ? `b${blockIdx}` : null;
      // Empty rows: Papa can emit rows where every value is blank.
      const hasAny = Object.values(r).some((v) => v != null && String(v).trim() !== "");
      if (!hasAny) {
        skips.empty_row++;
        continue;
      }

      const player = getFrom(r, playerKeys);

      // UDisc's first row per card is "Par" — capture per-hole par for the
      // scorecard group so we can build a real per-hole breakdown later, then skip.
      if (player.toLowerCase() === "par") {
        if (holeCols.length) {
          const parCourse = getFrom(r, courseKeys);
          let parPlayed = parseDate(getFrom(r, dateKeys));
          if (!parPlayed) {
            for (const v of Object.values(r)) {
              const iso = parseDate(String(v ?? ""));
              if (iso) {
                parPlayed = iso;
                break;
              }
            }
          }
          const parLayout = getFrom(r, layoutKeys) || "";
          if (parCourse && parPlayed) {
            const gk = bk ?? `${parPlayed}|${parCourse.slice(0, 200)}|${parLayout.slice(0, 200)}`;
            const map = parByGroup.get(gk) ?? new Map<number, number>();
            for (const hc of holeCols) {
              const v = pickNum(r[hc.original]);
              if (v != null && v > 0) map.set(hc.number, v);
            }
            if (map.size) parByGroup.set(gk, map);
          }
        }
        skips.par_row++;
        continue;
      }
      // Doubles/team cards ("A + B") never count — drop them before anything else.
      if (isTeamPlayerName(player)) {
        // Only count the caller's own doubles cards in the summary.
        const parts = player.split(/\s*(?:\+|&|\band\b)\s*/i).filter(Boolean);
        const mine = parts.some((p) =>
          confirmedNames.size > 0 ? confirmedNames.has(normalizeAlias(p)) : hasFilter && matchesAlias(p),
        );
        if (mine) skips.doubles_group++;
        continue;
      }
      if (player) playersSeen.set(player, (playersSeen.get(player) ?? 0) + 1);

      const course = getFrom(r, courseKeys);
      // Try named date columns first, then any cell that parses as a date.
      let played = parseDate(getFrom(r, dateKeys));
      if (!played) {
        for (const v of Object.values(r)) {
          const iso = parseDate(String(v ?? ""));
          if (iso) {
            played = iso;
            break;
          }
        }
      }
      const layoutPre = getFrom(r, layoutKeys) || "";

      // Register this player in the scorecard group BEFORE any filter, so we
      // can later drop rounds that were played solo or infer doubles.
      const rowTotalPre = pickNum(getFrom(r, totalKeys));
      const rowToParPre = pickNum(getFrom(r, toParKeys));
      if (course && played && player) {
        const gk = bk ?? `${played}|${course.slice(0, 200)}|${layoutPre.slice(0, 200)}`;
        let set = groupPlayers.get(gk);
        if (!set) {
          set = new Set();
          groupPlayers.set(gk, set);
        }
        set.add(player.toLowerCase());
        if (rowTotalPre != null) {
          let smap = groupScores.get(gk);
          if (!smap) {
            smap = new Map();
            groupScores.set(gk, smap);
          }
          smap.set(player.toLowerCase(), `${rowTotalPre}|${rowToParPre ?? ""}`);
        }
      }

      // Names the player explicitly picked win over profile-alias guessing.
      const matchesFilter =
        confirmedNames.size > 0
          ? confirmedNames.has(normalizeAlias(player))
          : hasFilter
            ? exactAliases.has(normalizeAlias(player))
            : true;

      if (!matchesFilter) {
        skips.name_mismatch++;
        continue;
      }
      // Any team on the card makes the whole scorecard a doubles/team round.
      if (blockIdx >= 0 && teamBlocks.has(blockIdx)) {
        skips.doubles_group++;
        continue;
      }

      if (!course) {
        skips.missing_course++;
        continue;
      }
      if (!played) {
        skips.missing_date++;
        continue;
      }

      const layout = getFrom(r, layoutKeys) || null;
      const total = pickNum(getFrom(r, totalKeys));
      const toPar = pickNum(getFrom(r, toParKeys));
      const rating = pickNum(getFrom(r, ratingKeys));
      const ssaVal = pickNum(getFrom(r, ssaKeys));
      const formatRaw = getFrom(r, formatKeys).toLowerCase();

      const layoutStr = layout ? layout.slice(0, 200) : null;
      const courseStr = course.slice(0, 200);
      const noteStr = player ? `UDisc scorecard for ${player}` : null;
      // Prefer an explicit UDisc format column when present, otherwise
      // fall back to keyword sniffing across course / layout / notes.
      let fmt: "singles" | "doubles" | "team" = "singles";
      if (/team|scramble.*team|4[- ]?person|3[- ]?person/.test(formatRaw)) fmt = "team";
      else if (
        /doubles?|dubs|best\s*shot|worst\s*shot|alt(ernate)?\s*shot|captain|scramble/.test(
          formatRaw,
        )
      )
        fmt = "doubles";
      else if (player && /.+\s\+\s.+/.test(player))
        fmt = "doubles"; // "Player A + Player B" = partner round
      else if (formatRaw && /singles?|solo|stroke/.test(formatRaw)) fmt = "singles";
      else fmt = detectFormat({ layout_name: layoutStr, course_name: courseStr, notes: noteStr });

      // Skip non-singles entirely — no partner-assisted rounds in the database.
      if (fmt !== "singles") continue;

      // Capture per-hole strokes for this scorecard row when the CSV is wide-format.
      const holes: { number: number; strokes: number }[] = [];
      for (const hc of holeCols) {
        const v = pickNum(r[hc.original]);
        if (v != null && v > 0) holes.push({ number: hc.number, strokes: v });
      }

      rows.push({
        user_id: userId,
        source: "udisc",
        course_name: courseStr,
        layout_name: layoutStr,
        event_name: null,
        played_on: played,
        score: total,
        to_par: toPar,
        // Native UDisc RoundRating from the player's own row, stored exactly; blank stays NULL.
        round_rating: validUdiscRating(rating),
        ssa: ssaVal,
        notes: noteStr,
        format: fmt,
        included: true,
        // Track playgroup key so we can drop solo scorecards after the pass.
        _group: bk ?? `${played}|${courseStr}|${layoutStr ?? ""}`,
        _player: (player || "").toLowerCase(),
        _holes: holes.length ? holes : undefined,
      } as ExternalRoundInsert & {
        _group: string;
        _player: string;
        _holes?: { number: number; strokes: number }[];
      });
    }

    // Safety net: never save loosely matched players as this user. Exact names
    // selected from the CSV are trusted confirmations and may legitimately
    // include several UDisc identities owned by the same person.
    if (rows.length) {
      let distinctPlayers = new Set(rows.map((r) => r._player ?? "").filter(Boolean));
      if (confirmedNames.size > 0) {
        rows = rows.filter((r) => confirmedNames.has(normalizeAlias(r._player ?? "")));
        distinctPlayers = new Set(rows.map((r) => r._player ?? "").filter(Boolean));
      } else if (distinctPlayers.size > 1 && hasFilter) {
        const exact = new Set(aliases.map((a) => normalizeAlias(a)));
        const exactRows = rows.filter((r) => exact.has(normalizeAlias(r._player ?? "")));
        const exactNames = new Set(exactRows.map((r) => r._player ?? "").filter(Boolean));
        if (exactRows.length && exactNames.size === 1) {
          rows = exactRows;
          distinctPlayers = exactNames;
        }
      }
      // Several exact CSV names can all belong to one person (for example a
      // full name, handle, and abbreviated name used on older scorecards).
      // Only loose, unconfirmed multi-name matches are ambiguous.
      if (shouldRejectAmbiguousPlayerNames([...distinctPlayers], [...confirmedNames])) {
        // Not an error — ask the player to pick which names are theirs.
        const counts = new Map<string, number>();
        for (const r of rows) counts.set(r._player ?? "", (counts.get(r._player ?? "") ?? 0) + 1);
        return {
          inserted: 0,
          skipped: 0,
          message: null,
          needsChoice: true,
          playersFound: [...distinctPlayers]
            .map((name) => ({ name, count: counts.get(name) ?? 0 }))
            .sort((a, b) => b.count - a.count),
          skips,
          headers: rawHeaders,
        };
      }
    }

    const playersFound = [...playersSeen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([name, count]) => ({ name, count }));

    if (!rows.length) {
      const hint = hasFilter
        ? `No scorecard rows matched ${aliases.map((a) => `"${a}"`).join(", ")}. Names on this export: ${
            playersFound.map((p) => `${p.name} (${p.count})`).join(", ") || "none"
          }.`
        : `No importable rows. Skips — par:${skips.par_row}, empty:${skips.empty_row}, missing course:${skips.missing_course}, missing date:${skips.missing_date}. Headers seen: ${rawHeaders.join(" | ")}`;
      return {
        inserted: 0,
        skipped: parsed.data.length,
        message: hint,
        playersFound,
        skips,
        headers: rawHeaders,
      };
    }
    // Drop solo scorecards (only one distinct player in the CSV group), then split payload/hole helpers.
    type RowWithHoles = ExternalRoundInsert & {
      _holes?: { number: number; strokes: number }[];
      _group?: string;
    };
    const filteredRows: RowWithHoles[] = rows
      .filter((r) => {
        // A scorecard with no total (or a total of 0) was opened but never played.
        if (r.score == null || r.score <= 0) {
          skips.unfinished++;
          return false;
        }
        const set = r._group ? groupPlayers.get(r._group) : null;
        const distinct = set ? set.size : 1;

        if (r.format && r.format !== "singles") {
          skips.doubles_group++;
          return false;
        }
        if (distinct < 2) {
          skips.solo_group++;
          return false;
        }
        // Ties are normal on singles cards; doubles are identified only by
        // explicit team names ("A + B") or a format column, never by equal scores.
        return true;
      })
      .map(({ _player: _p, ...clean }) => {
        const set = clean._group ? groupPlayers.get(clean._group) : null;
        const c = classifyUdiscRound({
          format: clean.format ?? "singles",
          cardParticipants: set ? set.size : null,
          eventName: clean.event_name,
          layoutName: clean.layout_name,
        });
        return {
          ...clean,
          participant_count: c.participant_count,
          participant_count_source: c.participant_count_source,
          round_format_class: c.format_class,
          event_context: c.event_context,
          rating_exclusion_reason: c.exclusion_reason,
        } as RowWithHoles;
      });

    if (!filteredRows.length) {
      return {
        inserted: 0,
        skipped: parsed.data.length,
        message: `No verified group rounds to import. Skips — solo:${skips.solo_group}, par:${skips.par_row}, empty:${skips.empty_row}, missing course:${skips.missing_course}, missing date:${skips.missing_date}.`,
        playersFound,
        skips,
        headers: rawHeaders,
      };
    }

    // Dedupe UDisc rows against what's already in the DB so re-uploading
    // the same CSV (or an updated export that overlaps prior imports) does
    // not inflate round counts and rating windows.
    const { data: existingUdisc } = await supabase
      .from("external_rounds")
      .select("id, played_on, course_name, layout_name, score, round_format_class, round_rating")
      .eq("user_id", userId)
      .eq("source", "udisc");
    const { matchUdiscRecord, enrichmentPatch } = await import("@/lib/udisc-enrichment");
    const pool = [...(existingUdisc ?? [])] as Array<{
      id: string; played_on: string; course_name: string | null; layout_name: string | null;
      score: number | null; round_format_class: string | null; round_rating: number | null;
    }>;
    const touched = new Set<string>();
    let dupSkipped = 0;
    let reclassified = 0;
    let heldForReview = 0;
    const freshRows: RowWithHoles[] = [];
    for (const r of filteredRows) {
      const key = { played_on: r.played_on, course_name: r.course_name ?? null, layout_name: r.layout_name ?? null, score: r.score ?? null };
      const { confidence, match } = matchUdiscRecord(key, pool);
      if (confidence === "POSSIBLE") { heldForReview++; continue; }
      if (match) {
        dupSkipped++;
        if (touched.has(match.id)) continue;
        touched.add(match.id);
        const patch = enrichmentPatch(match, r as never);
        if (Object.keys(patch).length) {
          const { error: upErr } = await supabase.from("external_rounds").update(patch as never).eq("id", match.id);
          if (!upErr) reclassified++;
        }
        continue;
      }
      // Each Par block is its own scorecard, so rows in one file never dedupe each other.
      freshRows.push(r);
    }
    // Optional per-call cap so the browser can save in small steps and show
    // progress. Later calls re-parse the file; already-saved rounds dedupe.
    const remaining = data.maxInsert ? Math.max(0, freshRows.length - data.maxInsert) : 0;
    if (data.maxInsert) freshRows.splice(data.maxInsert);
    const udiscKey = (d: string, c: string | null, l: string | null, s: number | null) =>
      `${d}|${(c ?? "").toLowerCase()}|${(l ?? "").toLowerCase()}|${s ?? ""}`;
    const heldNote = heldForReview ? ` ${heldForReview} looked like rounds already on file but didn't match cleanly, so we held them back instead of risking a duplicate.` : "";

    if (!freshRows.length) {
      return {
        inserted: 0,
        skipped: parsed.data.length,
        message: reclassified
          ? `All ${dupSkipped} rounds were already imported. Added new details to ${reclassified} of them.${heldNote}`
          : `All ${dupSkipped} matched rows are already imported. Nothing new to add.${heldNote}`,
        playersFound,
        skips: { ...skips, duplicate: dupSkipped },
        headers: rawHeaders,
      };
    }

    // Strip helper fields before insert.
    const insertPayload: ExternalRoundInsert[] = freshRows.map(
      ({ _group: _g, _holes: _h, ...clean }) => clean,
    );
    // Insert in small batches: each row fires matching/rating triggers, and one
    // large insert exceeds the database statement timeout.
    const insertedRows: { id: string; played_on: string; course_name: string | null; layout_name: string | null; score: number | null }[] = [];
    const BATCH = 25;
    for (let i = 0; i < insertPayload.length; i += BATCH) {
      const { data, error } = await supabase
        .from("external_rounds")
        .insert(insertPayload.slice(i, i + BATCH) as never)
        .select("id, played_on, course_name, layout_name, score");
      if (error) {
        if (insertedRows.length === 0) throw new Error(error.message);
        throw new Error(
          `Saved ${insertedRows.length} rounds, then stopped: ${error.message}. Upload the same file again to add the rest — saved rounds won't be duplicated.`,
        );
      }
      insertedRows.push(...((data ?? []) as typeof insertedRows));
    }
    const inserted = insertedRows.length;

    // Persist per-hole strokes for wide-format rounds where we captured both a
    // par row and hole strokes. Match inserted DB rows back to source rows by
    // (date, course, layout, score) — the same key used for dedupe.
    let holesInserted = 0;
    if (holeCols.length && insertedRows?.length) {
      const idByKey = new Map<string, string>();
      for (const row of insertedRows) {
        idByKey.set(
          udiscKey(
            row.played_on as string,
            row.course_name as string | null,
            row.layout_name as string | null,
            row.score as number | null,
          ),
          row.id as string,
        );
      }
      const holePayload: {
        external_round_id: string;
        hole_number: number;
        par: number | null;
        strokes: number;
      }[] = [];
      for (const r of freshRows) {
        if (!r._holes?.length) continue;
        const key = udiscKey(
          r.played_on,
          r.course_name ?? null,
          r.layout_name ?? null,
          r.score ?? null,
        );
        const rid = idByKey.get(key);
        if (!rid) continue;
        const parMap = r._group ? parByGroup.get(r._group) : null;
        for (const h of r._holes) {
          holePayload.push({
            external_round_id: rid,
            hole_number: h.number,
            par: parMap?.get(h.number) ?? null,
            strokes: h.strokes,
          });
        }
      }
      for (let i = 0; i < holePayload.length; i += 1000) {
        const slice = holePayload.slice(i, i + 1000);
        const { error: holeErr, count: holeCount } = await supabase
          .from("external_round_holes")
          .insert(slice as never, { count: "exact" });
        if (!holeErr) holesInserted += holeCount ?? slice.length;
      }
    }

    void holesInserted;
    const skipped = parsed.data.length - inserted;
    return {
      inserted,
      remaining,
      skipped,
      message:
        skipped > 0
          ? `Imported ${inserted}. Skipped ${skipped} — duplicate:${dupSkipped}, unfinished:${skips.unfinished}, solo:${skips.solo_group}, par:${skips.par_row}, other player:${skips.name_mismatch}, empty:${skips.empty_row}, missing course:${skips.missing_course}, missing date:${skips.missing_date}.`
          : null,
      playersFound,
      skips: { ...skips, duplicate: dupSkipped },
      headers: rawHeaders,
    };
  });

/* ------------------------------------------------------------------ */
/* PDGA public rated-round lookup                                      */
/* ------------------------------------------------------------------ */
/**
 * PDGA publishes every rated round for every player at
 *   https://www.pdga.com/player/{PDGA#}/details
 * The page contains a table with columns like:
 *   Tournament | Tier | Date | Division | Round | Score | Rating | Included | Evaluated
 * We fetch it server-side and pull round rating rows via a tolerant HTML parse.
 */
async function fetchPdgaDetail(pdgaNumber: number): Promise<string> {
  const url = `https://www.pdga.com/player/${pdgaNumber}/details`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0; +https://dg-dashboard.app)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`PDGA lookup failed (HTTP ${res.status}) for #${pdgaNumber}`);
  }
  return await res.text();
}

/* Parsing lives in the shared, label-based reader (dgd-v1/pdga-details). */

export const importPdgaRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        pdgaNumber: z.number().int().min(1).max(999_999_999),
        saveToProfile: z.boolean().optional().default(true),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const html = await fetchPdgaDetail(data.pdgaNumber);
    const page = parsePdgaDetailPage(html, data.pdgaNumber);
    const officialRating = page.current_rating;
    let rejected = 0;
    const rounds = page.rounds.flatMap((r) => {
      if (pdgaRoundIssues(r).length) {
        rejected++;
        return [];
      }
      const { par } = agreedPar(r);
      return [{
        tournament: r.event_name || "PDGA Event",
        date: r.played_on,
        score: r.score,
        rating: r.round_rating,
        round_label: r.round_number != null ? `Rd ${r.round_number}` : null,
        layout: r.pools.length === 1 ? r.pools[0].name : null,
        to_par: par != null && r.score != null ? r.score - par : null,
        division: r.division,
        included: r.included,
        evaluated_on: null as string | null,
      }];
    });

    // Always sync the official current rating + PDGA number, even if no new
    // rounds are parsed. This is the source of truth for "PDGA Rating".
    if (data.saveToProfile) {
      const patch: { pdga_number: string; pdga_rating?: number } = {
        pdga_number: String(data.pdgaNumber),
      };
      if (officialRating != null) patch.pdga_rating = officialRating;
      await supabase.from("profiles").update(patch).eq("id", userId);
    }

    if (!rounds.length) {
      return {
        inserted: 0,
        skipped: 0,
        officialRating,
        message:
          officialRating != null
            ? `Synced official PDGA rating (${officialRating}). No rated rounds could be parsed from the details page.`
            : "No rated rounds parsed from the PDGA page. Confirm the number is correct and the player has PDGA-rated events.",
      };
    }

    // Dedupe by physical round (date + event + round label + score) — rating
    // is unstable (PDGA re-evaluates and updates it later) so keying on it
    // would double-insert the same round each time PDGA revises the number.
    // When the round already exists but PDGA has newer rating/included/
    // evaluated_on values, update the existing row in place.
    const { data: existing } = await supabase
      .from("external_rounds")
      .select("id, played_on, event_name, layout_name, score, round_rating, included, evaluated_on")
      .eq("user_id", userId)
      .eq("source", "pdga");
    // Older rows stored a guessed round label, so match on date + event +
    // score. PDGA lists one date per event, so two rounds of the same event
    // can share a key: each stored row is consumed once, never merged.
    const pdgaKey = (d: string, e: string | null, s: number | null) =>
      `${d}|${(e ?? "").toLowerCase()}|${s ?? ""}`;
    type Prior = { id: string; round_rating: number | null; included: boolean | null; evaluated_on: string | null };
    const existingByKey = new Map<string, Prior[]>();
    for (const e of existing ?? []) {
      const k = pdgaKey(e.played_on as string, e.event_name as string | null, e.score as number | null);
      existingByKey.set(k, [
        ...(existingByKey.get(k) ?? []),
        {
          id: e.id as string,
          round_rating: (e.round_rating as number | null) ?? null,
          included: (e.included as boolean | null) ?? null,
          evaluated_on: (e.evaluated_on as string | null) ?? null,
        },
      ]);
    }

    const inserts: ExternalRoundInsert[] = [];
    let updated = 0;
    for (const r of rounds) {
      const k = pdgaKey(r.date, r.tournament, r.score);
      const queue = existingByKey.get(k) ?? [];
      // Prefer the stored row whose rating already agrees.
      const at = Math.max(0, queue.findIndex((p) => p.round_rating === r.rating));
      const prior = queue.length ? queue.splice(at, 1)[0] : undefined;
      if (prior) {
        // Only PDGA-owned flags are refreshed; score/date/event are never rewritten.
        const patch: Partial<ExternalRoundInsert> = {};
        if (r.rating != null && prior.round_rating !== r.rating) patch.round_rating = r.rating;
        if (r.included != null && prior.included !== r.included) patch.included = r.included;
        if (Object.keys(patch).length && prior.id) {
          const { error: uerr } = await supabase
            .from("external_rounds")
            .update(patch as never)
            .eq("id", prior.id);
          if (!uerr) updated++;
        }
        continue;
      }
      const fmt = detectFormat({
        event_name: r.tournament,
        layout_name: r.layout,
        division: r.division,
      });
      inserts.push({
        user_id: userId,
        source: "pdga",
        course_name: r.tournament,
        layout_name: r.layout,
        event_name: r.tournament,
        played_on: r.date,
        score: r.score,
        to_par: r.to_par,
        round_rating: r.rating,
        ssa: null,
        notes: `PDGA #${data.pdgaNumber} — ${r.round_label ?? "round"}${r.division ? ` (${r.division})` : ""}`,
        format: fmt,
        division: r.division,
        included: r.included,
        evaluated_on: r.evaluated_on,
      });
    }

    if (inserts.length) {
      const { error } = await supabase.from("external_rounds").insert(inserts as never);
      if (error) throw new Error(error.message);
    }

    return {
      inserted: inserts.length,
      skipped: rounds.length - inserts.length - updated,
      rejected,
      updated,
      officialRating,
      message:
        inserts.length === 0 && updated === 0
          ? `All rounds already imported.${officialRating != null ? ` Official PDGA rating synced: ${officialRating}.` : ""}`
          : `Imported ${inserts.length}${updated ? `, refreshed ${updated}` : ""} round${inserts.length === 1 && !updated ? "" : "s"}.${officialRating != null ? ` Official PDGA rating: ${officialRating}.` : ""}`,
    };
  });

/* ------------------------------------------------------------------ */
/* Manual single-round entry                                           */
/* ------------------------------------------------------------------ */
export const addManualRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        courseName: z.string().trim().min(1).max(200),
        layoutName: z.string().trim().max(200).optional().nullable(),
        eventName: z.string().trim().max(200).optional().nullable(),
        playedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        score: z.number().int().min(1).max(500).nullable().optional(),
        toPar: z.number().int().min(-99).max(99).nullable().optional(),
        roundRating: z.number().int().min(300).max(1300).nullable().optional(),
        ssa: z.number().min(20).max(200).nullable().optional(),
        notes: z.string().max(500).optional().nullable(),
        format: z.enum(["singles", "doubles", "team", "other"]).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fmt =
      data.format ??
      detectFormat({
        event_name: data.eventName ?? null,
        layout_name: data.layoutName ?? null,
        course_name: data.courseName,
        notes: data.notes ?? null,
      });
    const { error, data: row } = await supabase
      .from("external_rounds")
      .insert({
        user_id: userId,
        source: "manual",
        course_name: data.courseName,
        layout_name: data.layoutName ?? null,
        event_name: data.eventName ?? null,
        played_on: data.playedOn,
        score: data.score ?? null,
        to_par: data.toPar ?? null,
        round_rating: data.roundRating ?? null,
        ssa: data.ssa ?? null,
        notes: data.notes ?? null,
        format: fmt,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

/* ------------------------------------------------------------------ */
/* Listing + delete for management                                     */
/* ------------------------------------------------------------------ */
export const listMyImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Page through so we return every imported round, not just the last 200.
    const pageSize = 1000;
    let from = 0;
    type Row = {
      id: string;
      source: string;
      course_name: string;
      layout_name: string | null;
      event_name: string | null;
      played_on: string;
      score: number | null;
      to_par: number | null;
      round_rating: number | null;
      ssa: number | null;
      notes: string | null;
      format: string | null;
      division: string | null;
      included: boolean | null;
    };
    const all: Row[] = [];
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase
        .from("external_rounds")
        .select(
          "id, source, course_name, layout_name, event_name, played_on, score, to_par, round_rating, ssa, notes, format, division, included",
        )
        .eq("user_id", userId)
        .order("played_on", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  });

export const deleteImportedRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("external_rounds")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Patch a small set of user-editable fields on an imported round. Used by the
 * "Needs review" workflow to fill in missing score or round rating so the round
 * can count in stats and rating calcs.
 */
export const patchImportedRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        score: z.number().int().min(1).max(300).nullable().optional(),
        round_rating: z.number().int().min(300).max(1200).nullable().optional(),
        included: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.score !== undefined) patch.score = data.score;
    if (data.round_rating !== undefined) patch.round_rating = data.round_rating;
    if (data.included !== undefined) patch.included = data.included;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase
      .from("external_rounds")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
