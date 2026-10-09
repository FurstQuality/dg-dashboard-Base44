import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Info, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDgpBenchmarks, type BenchmarkSlot } from "@/lib/dgp-kb.functions";

const CLASS_LABEL: Record<string, string> = {
  distance_driver: "Distance driver",
  fairway_driver: "Fairway driver",
  midrange: "Midrange",
  putter: "Putter",
};

const SHAPE_LABEL: Record<string, string> = {
  hyzer: "Hyzer",
  straight: "Straight",
  anhyzer: "Anhyzer",
};

/** Below this many submissions we say so instead of implying a trend. */
const LOW_CONFIDENCE = 5;

type Props = { pdgaRating?: number | null; udiscRating?: number | null };

/**
 * Survey benchmarks from players in the same rating band: which discs they
 * throw on each shot shape, at what weight, and how far.
 */
export function LevelBenchmarkPanel({ pdgaRating, udiscRating }: Props) {
  const [style, setStyle] = useState<"backhand" | "forehand">("backhand");
  const run = useServerFn(getDgpBenchmarks);

  const query = useQuery({
    queryKey: ["dgp-benchmarks", pdgaRating ?? null, udiscRating ?? null, style],
    queryFn: () =>
      run({
        data: {
          pdgaRating: pdgaRating ?? null,
          udiscRating: udiscRating ?? null,
          throwStyle: style,
          discsPerSlot: 3,
        },
      }),
    staleTime: 30 * 60_000,
  });

  const grouped = useMemo(() => {
    const slots = query.data?.slots ?? [];
    const byClass = new Map<string, BenchmarkSlot[]>();
    for (const slot of slots) {
      const list = byClass.get(slot.disc_class) ?? [];
      list.push(slot);
      byClass.set(slot.disc_class, list);
    }
    return [...byClass.entries()];
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Loading benchmarks for your rating band…
      </div>
    );
  }

  if (!query.data || query.data.slots.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="font-display text-base font-semibold">What players at your level throw</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We don&apos;t have survey answers for your rating band yet. Add your PDGA rating in your
          profile to match a band, or check back after the next data refresh.
        </p>
      </div>
    );
  }

  const data = query.data;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold">What players at your level throw</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.pdga_band} PDGA rating ·{" "}
            {/^no /i.test(data.udisc_band) ? data.udisc_band : `${data.udisc_band} UDisc rating`} ·{" "}
            {data.total_submissions} survey answer{data.total_submissions === 1 ? "" : "s"}
          </p>
        </div>
        <div className="inline-flex rounded-lg border p-0.5">
          {(["backhand", "forehand"] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={style === option ? "secondary" : "ghost"}
              className="h-8 px-3 capitalize"
              onClick={() => setStyle(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map(([discClass, slots]) => (
          <div key={discClass}>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CLASS_LABEL[discClass] ?? discClass}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {slots.map((slot) => (
                <div key={slot.shot_shape} className="rounded-lg border bg-card/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{SHAPE_LABEL[slot.shot_shape]}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {slot.submissions}
                    </span>
                  </div>
                  {slot.submissions < LOW_CONFIDENCE && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Small sample — treat as a starting point.
                    </p>
                  )}
                  <ul className="mt-2 space-y-1 text-sm">
                    {slot.top_discs.map((disc) => (
                      <li key={disc.label} className="flex items-baseline justify-between gap-2">
                        <span className="truncate">
                          {disc.mold ?? disc.label}
                          {disc.brand ? (
                            <span className="text-muted-foreground"> · {disc.brand}</span>
                          ) : null}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {disc.submissions}
                        </span>
                      </li>
                    ))}
                    {slot.top_discs.length === 0 && (
                      <li className="text-muted-foreground">No answers for this shape yet.</li>
                    )}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {slot.top_weight && (
                      <Badge variant="secondary" className="font-normal">
                        {slot.top_weight.label}
                      </Badge>
                    )}
                    {slot.top_distance && (
                      <Badge variant="secondary" className="font-normal">
                        {slot.top_distance.label}
                      </Badge>
                    )}
                    {slot.top_flight && (
                      <Badge variant="secondary" className="font-normal">
                        {slot.top_flight.label}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Survey data collected by{" "}
          <a
            className="inline-flex items-center gap-1 underline"
            href={data.attribution.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {data.attribution.name}
            <ExternalLink className="h-3 w-3" />
          </a>
          . Counts are the number of players who reported each answer, not a recommendation.
        </span>
      </p>
    </div>
  );
}
