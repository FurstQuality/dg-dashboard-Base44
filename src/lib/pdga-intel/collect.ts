/**
 * Multi-stage PDGA resolver: summary → rating history → ratings detail →
 * linked event pages. Pure orchestration over an injected polite fetcher so it
 * runs identically in the server job and in tests. Produces one payload that
 * the database applies with diff-only, supersede-never-overwrite semantics.
 */
import { parsePdgaDetailPage } from "@/lib/dgd-v1/pdga-details";
import { normalizePdgaNumber } from "@/lib/pdga-number";
import type { PoliteFetcher } from "./fetcher";
import {
  PARSER_VERSIONS,
  parseEventPage,
  parsePlayerSummary,
  parseRatingHistory,
  type EventPage,
} from "./parsers";
import { resolveRound, type ResolvedRound } from "./derive";

export type IntelPayload = {
  pdga_number: string;
  fetches: {
    url: string;
    kind: string;
    parser_version: string;
    status: number | null;
    ok: boolean;
    error: string | null;
    retrieved_at: string;
    attempts: number;
  }[];
  summary: ReturnType<typeof parsePlayerSummary> | null;
  history: { effective_date: string; rating: number; rounds_used: number | null }[];
  rounds: ResolvedRound[];
  events: Omit<EventPage, "issues">[];
  issues: { where: string; problem: string }[];
};

export async function collectPdgaIntel(
  pdgaNumberIn: string,
  fetcher: PoliteFetcher,
  opts: { maxEvents?: number; skipEventIds?: Set<string> } = {},
): Promise<IntelPayload> {
  const pdga = normalizePdgaNumber(pdgaNumberIn);
  if (!pdga) throw new Error("Enter a valid PDGA number.");
  const base = `https://www.pdga.com/player/${pdga}`;
  const out: IntelPayload = {
    pdga_number: pdga,
    fetches: [],
    summary: null,
    history: [],
    rounds: [],
    events: [],
    issues: [],
  };
  const get = async (url: string, kind: keyof typeof PARSER_VERSIONS) => {
    const r = await fetcher.get(url);
    out.fetches.push({
      url,
      kind,
      parser_version: PARSER_VERSIONS[kind],
      status: r.status,
      ok: r.ok,
      error: r.log.error,
      retrieved_at: r.log.retrieved_at,
      attempts: r.log.attempts,
    });
    return r.ok ? r.text : null;
  };

  const sumHtml = await get(base, "player");
  if (sumHtml) out.summary = parsePlayerSummary(sumHtml, pdga);
  const histHtml = await get(`${base}/history`, "history");
  if (histHtml) {
    const h = parseRatingHistory(histHtml);
    out.history = h.entries;
    out.issues.push(...h.issues);
  }
  const detHtml = await get(`${base}/details`, "details");
  const detail = detHtml ? parsePdgaDetailPage(detHtml, pdga).rounds : [];

  const eventIds = [...new Set(detail.map((r) => r.pdga_event_id).filter((x): x is string => !!x))]
    .filter((id) => !opts.skipEventIds?.has(id))
    .slice(0, opts.maxEvents ?? 500);
  const events = new Map<string, EventPage>();
  for (const id of eventIds) {
    const html = await get(`https://www.pdga.com/tour/event/${id}`, "event");
    if (!html) continue;
    const ev = parseEventPage(html, id);
    out.issues.push(...ev.issues);
    events.set(id, ev);
  }
  out.events = [...events.values()].map(({ issues: _i, ...e }) => e);
  out.rounds = detail.map((r) =>
    resolveRound(
      r,
      pdga,
      out.history,
      r.pdga_event_id ? (events.get(r.pdga_event_id) ?? null) : null,
    ),
  );
  return out;
}
