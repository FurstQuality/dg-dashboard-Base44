import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MapPinned, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UnassignedPinsReview } from "@/components/admin/unassigned-pins-review";
import { getHarvestStatus, reviewCourseGeometry, runHarvestNow } from "@/lib/course-geometry/harvest.functions";

/** National tee pad + basket coverage from open map data, and the courses waiting for a person to confirm hole order. */
export function GeometryHarvestPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getHarvestStatus);
  const runFn = useServerFn(runHarvestNow);
  const reviewFn = useServerFn(reviewCourseGeometry);
  const q = useQuery({ queryKey: ["geometry-harvest"], queryFn: () => statusFn(), refetchInterval: 60_000 });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (r) => {
      toast.success(r.cells ? `Read 1 region: ${r.sites} mapped courses, ${r.filled} holes filled` : "Every region is up to date");
      void qc.invalidateQueries({ queryKey: ["geometry-harvest"] });
    },
    onError: () => toast.error("The map source didn't answer. It'll retry on its own."),
  });
  const review = useMutation({
    mutationFn: (v: { courseId: string; action: "accept" | "reject" }) => reviewFn({ data: v }),
    onSuccess: (r, v) => {
      toast.success(v.action === "accept" ? `${r.holes} holes filled` : "Set aside");
      void qc.invalidateQueries({ queryKey: ["geometry-harvest"] });
    },
  });
  const s = q.data;
  const pct = s && s.cells.total ? Math.round((s.cells.done / s.cells.total) * 100) : 0;
  const stats: Array<[string, number]> = s
    ? [
        ["Regions read", s.cells.done],
        ["Regions left", s.cells.pending + s.cells.running],
        ["Retrying", s.cells.error],
        ["Mapped courses found", s.sitesFound],
        ["Matched to our courses", s.coursesMatched],
        ["Holes filled", s.holesFilled],
        ["Pins on file", s.observations.total],
        ["Waiting for review", s.observations.needsReview],
        ["Not matched to a course", s.observations.unmatched],
        ["Moved since accepted", s.observations.conflict],
      ]
    : [];
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <MapPinned className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Tee pads and baskets nationwide</h2>
            <p className="text-sm text-muted-foreground">
              Reads open map data region by region across the US and adds tee pads and basket positions to each course's holes.
              Spots already on file are never replaced. Courses whose hole order had to be guessed wait below.
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => run.mutate()} disabled={run.isPending}>
          <Play className="h-4 w-4" />
          {run.isPending ? "Reading a region…" : "Read next region now"}
        </Button>
      </div>
      {s ? (
        <>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm">
              <span>{pct}% of the country read</span>
              <span className="tabular-nums text-muted-foreground">{s.cells.done.toLocaleString()} / {s.cells.total.toLocaleString()} regions</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map(([l, n]) => (
              <div key={l} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <h3 className="text-sm font-semibold">Confirm hole order</h3>
            {s.review.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting. Courses show up here when their map pins carry no hole numbers.</p>
            ) : (
              <ul className="mt-1 divide-y divide-border">
                {s.review.map((r) => (
                  <li key={r.courseId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link to="/courses/$courseId" params={{ courseId: r.courseId }} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {r.name}
                      <span className="ml-1 font-normal text-muted-foreground">{[r.city, r.state].filter(Boolean).join(", ")} · {r.pins} pins</span>
                    </Link>
                    <Button size="sm" onClick={() => review.mutate({ courseId: r.courseId, action: "accept" })}>Fill in walking order</Button>
                    <Button size="sm" variant="ghost" onClick={() => review.mutate({ courseId: r.courseId, action: "reject" })}>Set aside</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <UnassignedPinsReview />
          <p className="mt-3 text-xs text-muted-foreground">Map data © OpenStreetMap contributors.</p>
        </>
      ) : null}
    </section>
  );
}
