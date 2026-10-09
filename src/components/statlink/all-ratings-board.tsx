import { useQueries, useQuery } from "@tanstack/react-query";
import { getMyDgdPreview } from "@/lib/dgd-v1.functions";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getRatingSnapshot } from "@/lib/stats.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { StatlinkPanelSkeleton } from "@/components/statlink/statlink-states";
import { ArrowRight } from "lucide-react";

export type RatingSource = "pdga" | "udisc" | "chainlink";

type SourceCopy = {
  id: RatingSource;
  name: string;
  blurb: string;
  chipClass: string;
};

const SOURCES: SourceCopy[] = [
  {
    id: "pdga",
    name: "PDGA",
    blurb: "Sanctioned rounds only",
    chipClass: "border-primary/40 bg-primary/10 text-primary",
  },
  {
    id: "udisc",
    name: "UDisc",
    blurb: "Imported UDisc scorecards",
    chipClass: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  },
  {
    id: "chainlink",
    name: "DGD",
    blurb: "PDGA, UDisc singles with cardmates, and rounds scored here",
    chipClass: "border-accent/40 bg-accent/10 text-accent",
  },
];

/** Human label + trust level for the rating a source produced. */
function ratingMeta(source: RatingSource, snapshotSource: string | undefined) {
  if (source === "pdga") {
    return snapshotSource === "pdga_official"
      ? {
          label: "Official PDGA rating",
          trust: "Official" as const,
          tip: "Published by the PDGA on the second Tuesday of every month.",
        }
      : {
          label: "PDGA rating (estimate)",
          trust: "Estimate" as const,
          tip: "Calculated from your rated PDGA rounds while you wait for the next official update.",
        };
  }
  if (source === "udisc") {
    return snapshotSource === "udisc_official"
      ? {
          label: "UDisc round ratings",
          trust: "Published" as const,
          tip: "Built from the round ratings UDisc published for your rounds.",
        }
      : {
          label: "No UDisc rating on file",
          trust: "Not on file" as const,
          tip: "Your UDisc imports didn't include UDisc round ratings. DGD never fills this in with its own number.",
        };
  }
  return {
    label: "DGD Rating",
    trust: "DGD" as const,
    tip: "One rating from every eligible round, on a 0–1000 scale. 1000 is theoretical perfection.",
  };
}

const TRUST_CLASS: Record<string, string> = {
  Official: "border-primary/40 bg-primary/10 text-primary",
  Published: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  Estimate: "border-accent/40 bg-accent/10 text-accent",
  DGD: "border-accent/40 bg-accent/10 text-accent",
  "Not on file": "border-border bg-muted text-muted-foreground",
};

/**
 * One board that shows every rating DG Dashboard knows about — official PDGA,
 * UDisc-published, and DG Dashboard projections — side by side, so a player
 * never has to flip the source switcher to compare them.
 */
export function AllRatingsBoard({
  userId,
  activeSource,
  onFocusSource,
  compact = false,
  embedded = false,
  condensed = false,
  hideHeader = false,
}: {
  userId: string | undefined;
  activeSource: RatingSource;
  onFocusSource: (source: RatingSource) => void;
  /** Single-row strip for tabs that already show one source in depth. */
  compact?: boolean;
  /** Render heading + grid only, for use inside a larger card. */
  embedded?: boolean;
  /** Hide per-source round/best/average stats when a table below repeats them. */
  condensed?: boolean;
  /** Skip the built-in title when a parent card already provides one. */
  hideHeader?: boolean;
}) {
  const snap = useServerFn(getRatingSnapshot);

  // Same keys the source-scoped panels use, so nothing is fetched twice.
  const queries = useQueries({
    queries: SOURCES.map((s) => ({
      queryKey: statsKeys.snapshot(userId, s.id),
      queryFn: () => snap({ data: { source: s.id } }),
      staleTime: STATS_STALE.ratings,
    })),
  });

  // The DGD slot always shows the public V1.3 rating — never the retired projection.
  const dgdFn = useServerFn(getMyDgdPreview);
  const dgdQ = useQuery({
    queryKey: ["dgd-rating-v13"],
    queryFn: async () => { try { return (await dgdFn({ data: { model: "v13" } })) as Record<string, any>; } catch { return null; } },
    staleTime: 5 * 60_000,
  });
  const dgdRating: number | null = dgdQ.data?.available ? (dgdQ.data.display_rating ?? null) : null;
  const ratingFor = (id: RatingSource, snapshot: any) =>
    id === "chainlink" ? dgdRating : id === "udisc" && snapshot?.current.source !== "udisc_official" ? null : snapshot?.current.rating ?? null;
  const anyLoading = queries.some((q) => q.isLoading) || dgdQ.isLoading;
  const allFailed = queries.every((q) => q.isError);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/40 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          All ratings
        </span>
        {SOURCES.map((s, i) => {
          const q = queries[i]!;
          const snapshot = q.data ?? null;
          const meta = ratingMeta(s.id, snapshot?.current.source);
          // UDisc preservation: never show a DGD value in the UDisc slot.
          const rating = ratingFor(s.id, snapshot);
          const isActive = activeSource === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onFocusSource(s.id)}
              title={`${meta.label} — ${meta.tip}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                isActive
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="font-semibold uppercase tracking-wider">{s.name}</span>
              <span className="font-display text-base font-bold tabular-nums text-primary">
                {anyLoading ? "…" : (rating ?? "—")}
              </span>
              <span className="text-[11px]">{meta.trust}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const header = (
    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
      <span>All of your ratings</span>
      <span className="text-xs font-normal text-muted-foreground">
        Official numbers first, projections labeled — every source in one view.
      </span>
    </CardTitle>
  );

  const body = (
    <>
      {anyLoading ? (
        <StatlinkPanelSkeleton label="Gathering every rating…" rows={3} />
      ) : allFailed ? (
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load your ratings this time. Nothing about your rounds has changed — try
          again in a moment.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {SOURCES.map((s, i) => {
            const q = queries[i]!;
            const snapshot = q.data ?? null;
            const meta = ratingMeta(s.id, snapshot?.current.source);
            // UDisc preservation: never show a DGD value in the UDisc slot.
            const rating = ratingFor(s.id, snapshot);
            const isDgd = s.id === "chainlink";
            const used = isDgd ? (dgdQ.data?.eligible_rounds ?? 0) : snapshot?.current.usedRounds ?? 0;
            const udiscEstimate = isDgd || (s.id === "udisc" && snapshot?.current.source !== "udisc_official");
            const best = udiscEstimate ? null : snapshot?.current.bestRound ?? null;
            const avg = udiscEstimate ? null : snapshot?.current.average ?? null;
            const delta = udiscEstimate ? null : snapshot?.projected.delta ?? null;
            const isActive = activeSource === s.id;
            return (
              <div
                key={s.id}
                className={`rounded-2xl border p-4 transition ${
                  isActive ? "border-primary/60 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${s.chipClass}`}
                  >
                    {s.name}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      TRUST_CLASS[meta.trust] ?? ""
                    }`}
                    title={meta.tip}
                  >
                    {meta.trust}
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground" title={meta.tip}>
                  {meta.label}
                </div>
                <div className="font-display text-4xl font-bold tabular-nums leading-none text-primary">
                  {rating ?? "—"}
                </div>
                {q.isError && !isDgd ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This source didn&apos;t load. {s.blurb}.
                  </p>
                ) : rating == null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {(() => {
                      const c = (snapshot as { udiscCounts?: { imported: number; nativeRated: number } | null } | null)?.udiscCounts;
                      if (s.id === "udisc" && c && c.imported > 0) {
                        return `${c.imported.toLocaleString()} UDisc rounds imported · native UDisc ratings weren't included in this import.`;
                      }
                      if (isDgd) return "Not rated yet. Your DGD Rating appears after your first eligible round is processed.";
                      if (s.id === "udisc") return "No UDisc rounds imported yet — bring them in from Settings → Data & sync.";
                      return `No rated rounds here yet. ${s.blurb} — add rounds from Settings → Data & sync.`;
                    })()}
                  </p>
                ) : condensed ? null : (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <dt className="text-muted-foreground">Rounds</dt>
                      <dd className="font-semibold tabular-nums">{used}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Best</dt>
                      <dd className="font-semibold tabular-nums">{best ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Average</dt>
                      <dd className="font-semibold tabular-nums">{avg ?? "—"}</dd>
                    </div>
                  </dl>
                )}
                {delta != null && rating != null ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Next update trend:{" "}
                    <b className="tabular-nums text-foreground">
                      {delta > 0 ? `+${delta}` : delta}
                    </b>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className="space-y-3">
        {hideHeader ? null : header}
        {body}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">{header}</CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
