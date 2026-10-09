/**
 * Phase 3.5 normalization pass. Server-only, runs before each DGD V1 job.
 *  1. Malformed PDGA rows (shifted columns: bogus 2001/Jan-1 dates, no event
 *     ref) whose exact clean twin exists are LINKED into the twin's canonical
 *     round. Source rows are never edited or deleted.
 *  2. Every flagged possible duplicate gets a recorded resolution.
 *  3. Every canonical round gets hole count + origin, implied par, course /
 *     layout mapping with confidence, and a data-issue diagnosis.
 */
type Admin = any;

export async function selectAll(admin: Admin, table: string, cols: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const GENERIC_LAYOUT = new Set(["", "main", "main layout", "default", "18 hole layout", "18 hole main layout", "18 holes"]);

export function isMalformedPdga(e: { source: string; pdga_event_ref: string | null; played_on: string }): boolean {
  if (e.source !== "pdga" || e.pdga_event_ref) return false;
  return e.played_on.startsWith("2001-") || e.played_on.endsWith("-01-01");
}

/** Hole count implied by an explicit layout name, checked against par. */
export function holesFromLayoutName(name: string | null, parPlayed: number | null): number | null {
  const n = norm(name);
  let h: number | null = null;
  const m = n.match(/\b(\d{1,2})\s*holes?\b/);
  if (m) h = Number(m[1]);
  else if (/\b(front|back) 9\b/.test(n)) h = 9;
  if (h == null || h < 1) return null;
  if (parPlayed != null && (parPlayed < 2.5 * h || parPlayed > 4.5 * h)) return null;
  return h;
}

export async function runNormalization(admin: Admin) {
  const ext = await selectAll(
    admin,
    "external_rounds",
    "id,user_id,source,course_name,layout_name,event_name,played_on,score,to_par,round_rating,pdga_event_ref,format",
  );
  const extById = new Map<string, any>(ext.map((e) => [e.id, e]));
  let links = await selectAll(admin, "canonical_round_sources", "canonical_round_id,source_table,source_row_id");
  const canonOf = (rowId: string) => links.find((l) => l.source_row_id === rowId)?.canonical_round_id as string | undefined;

  // ---- 1. Link malformed PDGA rows to their clean twin ----
  const reviews: any[] = [];
  const malformedNoTwin = new Set<string>();
  let linked = 0;
  for (const e of ext.filter(isMalformedPdga)) {
    const from = canonOf(e.id);
    if (!from) continue;
    const twins = ext.filter(
      (g) =>
        g.id !== e.id &&
        g.user_id === e.user_id &&
        g.source === "pdga" &&
        g.pdga_event_ref &&
        g.score === e.score &&
        g.round_rating != null &&
        g.round_rating === e.round_rating,
    );
    const targets = [...new Set(twins.map((t) => canonOf(t.id)).filter(Boolean))] as string[];
    if (targets.length === 1 && targets[0] !== from) {
      const { error } = await admin.rpc("dgd_v1_link_duplicate", { _from: from, _to: targets[0] });
      if (error) throw new Error(`link: ${error.message}`);
      linked++;
      reviews.push({
        canonical_round_id: from,
        counterpart_round_id: targets[0],
        user_id: e.user_id,
        resolution: "LINK",
        reason: "Malformed PDGA row (shifted columns) has one clean twin with the same score and round rating",
        evidence: { source_row_id: e.id, twin_row: twins[0].id, score: e.score, round_rating: e.round_rating, bad_date: e.played_on },
        applied: true,
      });
    } else if (targets.length !== 1) {
      malformedNoTwin.add(e.id);
    }
  }
  if (linked) links = await selectAll(admin, "canonical_round_sources", "canonical_round_id,source_table,source_row_id");

  const rounds = await selectAll(
    admin,
    "canonical_rounds",
    "id,user_id,played_on,course_key,course_name,layout_name,score,format,eligibility,has_possible_duplicate",
  );
  const srcByRound = new Map<string, any[]>();
  for (const l of links) {
    const e = l.source_table === "external_rounds" ? extById.get(l.source_row_id) : null;
    if (!e) continue;
    srcByRound.set(l.canonical_round_id, [...(srcByRound.get(l.canonical_round_id) ?? []), e]);
  }

  // ---- 2. Possible-duplicate resolutions ----
  for (const r of rounds.filter((x) => x.has_possible_duplicate)) {
    const others = rounds.filter(
      (o) => o.id !== r.id && o.user_id === r.user_id && o.played_on === r.played_on && o.score === r.score,
    );
    const mine = srcByRound.get(r.id) ?? [];
    let resolution: "KEEP_SEPARATE" | "NEEDS_REVIEW" = "NEEDS_REVIEW";
    let reason = "No counterpart round found";
    const o = others[0];
    if (o) {
      const theirs = srcByRound.get(o.id) ?? [];
      const allUdisc = [...mine, ...theirs].every((s) => s.source === "udisc");
      const allPdga = [...mine, ...theirs].every((s) => s.source === "pdga");
      const ratingsA = mine.map((s) => s.round_rating).filter((x) => x != null);
      const ratingsB = theirs.map((s) => s.round_rating).filter((x) => x != null);
      if (allUdisc && r.course_key && o.course_key && r.course_key !== o.course_key) {
        resolution = "KEEP_SEPARATE";
        reason = "Two UDisc scorecards at different courses on the same day";
      } else if (allPdga && ratingsA.length && ratingsB.length && !ratingsA.some((x) => ratingsB.includes(x))) {
        resolution = "KEEP_SEPARATE";
        reason = "Different official PDGA round ratings — different rounds";
      } else reason = "Same day and score with no deciding evidence";
    } else {
      resolution = "KEEP_SEPARATE";
      reason = "Counterpart was linked away; nothing left to collide with";
    }
    reviews.push({
      canonical_round_id: r.id,
      counterpart_round_id: o?.id ?? null,
      user_id: r.user_id,
      resolution,
      reason,
      evidence: { played_on: r.played_on, score: r.score, course_key: r.course_key, counterpart_course_key: o?.course_key ?? null },
      applied: false,
    });
  }
  for (let i = 0; i < reviews.length; i += 200) {
    const { error } = await admin
      .from("dgd_duplicate_reviews")
      .upsert(reviews.slice(i, i + 200).map((x) => ({ ...x, updated_at: new Date().toISOString() })), {
        onConflict: "canonical_round_id",
      });
    if (error) throw new Error(`reviews: ${error.message}`);
  }

  // ---- 3. Hole count + layout mapping ----
  const [courses, holeRows] = await Promise.all([
    selectAll(admin, "courses", "id,name"),
    selectAll(admin, "external_round_holes", "external_round_id,strokes"),
  ]);
  const courseByName = new Map<string, string[]>();
  for (const c of courses) {
    const k = norm(c.name);
    if (k) courseByName.set(k, [...(courseByName.get(k) ?? []), c.id]);
  }
  const holeAgg = new Map<string, { n: number; s: number }>();
  for (const h of holeRows) {
    const a = holeAgg.get(h.external_round_id) ?? { n: 0, s: 0 };
    a.n++;
    a.s += h.strokes ?? 0;
    holeAgg.set(h.external_round_id, a);
  }
  const matchedCourseIds = new Set<string>();
  for (const r of rounds) {
    const ids = courseByName.get(norm(r.course_name));
    if (ids?.length === 1) matchedCourseIds.add(ids[0]);
  }
  const layoutsByCourse = new Map<string, any[]>();
  const ids = [...matchedCourseIds];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("course_layouts").select("id,course_id,name,hole_count,par_total").in("course_id", ids.slice(i, i + 200));
    if (error) throw new Error(`layouts: ${error.message}`);
    for (const l of data ?? []) layoutsByCourse.set(l.course_id, [...(layoutsByCourse.get(l.course_id) ?? []), l]);
  }
  const allLayoutIds = [...layoutsByCourse.values()].flat().map((l) => l.id);
  const holesPerLayout = new Map<string, number>();
  for (let i = 0; i < allLayoutIds.length; i += 200) {
    const { data } = await admin.from("holes").select("layout_id").in("layout_id", allLayoutIds.slice(i, i + 200));
    for (const h of data ?? []) holesPerLayout.set(h.layout_id, (holesPerLayout.get(h.layout_id) ?? 0) + 1);
  }

  const rows: any[] = [];
  for (const r of rounds) {
    const src = srcByRound.get(r.id) ?? [];
    const ud = src.find((s) => s.source === "udisc" && s.score === r.score && s.to_par != null);
    const toPar: number | null = ud?.to_par ?? null;
    const par = r.score != null && toPar != null ? r.score - toPar : null;
    let hole: number | null = null;
    let origin = "UNKNOWN";
    const ev: Record<string, unknown> = {};
    for (const s of src) {
      const a = holeAgg.get(s.id);
      if (a && a.n > 0 && a.s === r.score) {
        hole = a.n;
        origin = "HOLE_SCORE_COUNT";
        break;
      }
    }
    // Course / layout mapping
    let mapping = "UNMAPPED";
    let courseId: string | null = null;
    let layoutId: string | null = null;
    const cids = courseByName.get(norm(r.course_name)) ?? [];
    if (cids.length === 1) {
      courseId = cids[0];
      const ls = layoutsByCourse.get(courseId) ?? [];
      const ln = norm(r.layout_name);
      const exact = ls.filter((l) => norm(l.name) === ln && ln);
      if (exact.length === 1) {
        layoutId = exact[0].id;
        mapping = "EXACT";
        ev.layout = "name match";
      } else if (ls.length === 1 && GENERIC_LAYOUT.has(ln)) {
        const lh = holesPerLayout.get(ls[0].id) ?? null;
        const parOk = par != null && ls[0].par_total != null && par === ls[0].par_total;
        if (parOk || (hole != null && lh != null && hole === lh)) {
          layoutId = ls[0].id;
          mapping = "HIGH_CONFIDENCE";
          ev.layout = parOk ? "only layout; par matches" : "only layout; hole count matches";
        } else {
          mapping = "POSSIBLE";
          ev.layout = "only layout, generic name, no par/hole evidence";
        }
      } else {
        mapping = "POSSIBLE";
        ev.layout = ls.length ? "course matched, layout name not found" : "course matched, no app layouts";
      }
      ev.course = "unique name match";
    } else if (cids.length > 1) {
      mapping = "POSSIBLE";
      ev.course = `${cids.length} courses share this name`;
    }
    if (hole == null && layoutId) {
      const lh = holesPerLayout.get(layoutId);
      if (lh && lh >= 1) {
        hole = lh;
        origin = "LAYOUT_INFERRED";
        ev.holes = "pinned holes on mapped layout";
      }
    }
    if (hole == null) {
      const h = holesFromLayoutName(r.layout_name, par);
      if (h) {
        hole = h;
        origin = "LAYOUT_INFERRED";
        ev.holes = "explicit hole count in layout name, consistent with par";
      }
    }
    // Diagnosis
    let issue: string | null = null;
    let detail: string | null = null;
    if (src.some((s) => malformedNoTwin.has(s.id))) {
      issue = "MALFORMED_SOURCE";
      detail = "PDGA row with shifted columns and no clean twin";
    } else if (r.score != null && r.score < 18) {
      issue = "INCOMPLETE_ROUND";
      detail =
        par != null
          ? `Par played ${par} (≈${Math.max(1, Math.round(par / 3))} holes): round was stopped early`
          : "Very low total with no par — likely a partial round";
    } else if (r.score != null && r.score > 130) {
      issue = "NEEDS_REVIEW";
      detail = `Total ${r.score} at ${toPar != null ? `+${toPar}` : "unknown par"} — unusual format or manual entry`;
    }
    rows.push({
      canonical_round_id: r.id,
      user_id: r.user_id,
      hole_count: hole,
      hole_count_origin: origin,
      to_par: toPar,
      par_played: par,
      course_id: courseId,
      layout_id: layoutId,
      layout_mapping: mapping,
      mapping_evidence: ev,
      data_issue: issue,
      data_issue_detail: detail,
      normalized_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await admin.from("dgd_round_normalization").upsert(rows.slice(i, i + 300), { onConflict: "canonical_round_id" });
    if (error) throw new Error(`normalization: ${error.message}`);
  }

  const pct = (n: number) => (rows.length ? Math.round((1000 * n) / rows.length) / 10 : 0);
  const cnt = (f: (x: any) => boolean) => rows.filter(f).length;
  const aliasKeys = new Set(rounds.map((r) => `${r.course_key}|${norm(r.layout_name)}`));
  return {
    linked_malformed: linked,
    malformed_without_twin: malformedNoTwin.size,
    duplicate_reviews: {
      LINK: reviews.filter((x) => x.resolution === "LINK").length,
      KEEP_SEPARATE: reviews.filter((x) => x.resolution === "KEEP_SEPARATE").length,
      NEEDS_REVIEW: reviews.filter((x) => x.resolution === "NEEDS_REVIEW").length,
    },
    canonical_rounds: rows.length,
    hole_count: {
      known_pct: pct(cnt((x) => x.hole_count_origin === "HOLE_SCORE_COUNT" || x.hole_count_origin === "IMPORTED")),
      inferred_pct: pct(cnt((x) => x.hole_count_origin === "LAYOUT_INFERRED" || x.hole_count_origin === "EVENT_INFERRED")),
      unknown_pct: pct(cnt((x) => x.hole_count_origin === "UNKNOWN")),
      by_origin: Object.fromEntries(
        ["IMPORTED", "HOLE_SCORE_COUNT", "LAYOUT_INFERRED", "EVENT_INFERRED", "MANUAL", "UNKNOWN"].map((o) => [o, cnt((x) => x.hole_count_origin === o)]),
      ),
    },
    layout_mapping: {
      source_layout_aliases: aliasKeys.size,
      canonical_courses_matched: new Set(rows.map((x) => x.course_id).filter(Boolean)).size,
      canonical_layouts_matched: new Set(rows.map((x) => x.layout_id).filter(Boolean)).size,
      rounds_by_confidence: Object.fromEntries(
        ["EXACT", "HIGH_CONFIDENCE", "POSSIBLE", "UNMAPPED"].map((m) => [m, cnt((x) => x.layout_mapping === m)]),
      ),
      mapped_round_pct: pct(cnt((x) => x.layout_mapping === "EXACT" || x.layout_mapping === "HIGH_CONFIDENCE")),
      possible_round_pct: pct(cnt((x) => x.layout_mapping === "POSSIBLE")),
      unmapped_round_pct: pct(cnt((x) => x.layout_mapping === "UNMAPPED")),
    },
    data_issues: rows
      .filter((x) => x.data_issue)
      .map((x) => ({ canonical_round_id: x.canonical_round_id, issue: x.data_issue, detail: x.data_issue_detail })),
  };
}
