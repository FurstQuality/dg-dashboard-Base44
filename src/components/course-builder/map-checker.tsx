import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, TriangleAlert } from "lucide-react";
import { completeness, mappingSummary, readiness, validateCourse, type FeatureInput, type HoleInput } from "@/lib/course-builder/validate";
import type { LatLng } from "@/lib/course-builder/geometry";

/** Pre-publish map check: completion score plus a clickable list of what's missing. */
export function MapChecker({
  boundaries,
  holes,
  features,
  infrastructureCount,
  onGoToHole,
}: {
  boundaries: LatLng[][];
  holes: HoleInput[];
  features: FeatureInput[];
  infrastructureCount: number;
  onGoToHole: (hole: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const warnings = useMemo(() => validateCourse({ boundaries, holes, features }), [boundaries, holes, features]);
  const score = useMemo(
    () => completeness({ hasBoundary: boundaries.length > 0, infrastructureCount, holes }),
    [boundaries.length, infrastructureCount, holes],
  );
  const pct = score.pct;
  const states = useMemo(() => readiness(holes), [holes]);
  const summary = useMemo(() => mappingSummary({ hasBoundary: boundaries.length > 0, holes }), [boundaries.length, holes]);
  const [review, setReview] = useState<string | null>(null);
  const shown = review ? (states.find((s) => s.key === review)?.missing ?? []) : warnings;

  return (
    <section aria-label="Map check" className="rounded-xl border border-border bg-card p-3 text-sm">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        {warnings.length ? (
          <TriangleAlert className="h-4 w-4 text-warning" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        <span className="font-semibold">Map check</span>
        <span className="ml-auto text-muted-foreground">{pct}% complete</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[13px]">
        {summary.rows.map((r) => (
          <div key={r.key} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className={r.done === r.total && r.total > 0 ? "text-success" : ""}>
              {r.key === "property" ? (r.done ? "Drawn" : "Not drawn") : r.key === "holes" ? r.total : `${r.done} / ${r.total}`}
            </dd>
          </div>
        ))}
      </dl>
      {summary.next ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Next</span>
            <span className="font-medium">{summary.next.label}</span>
          </span>
          {summary.next.hole ? (
            <button
              type="button"
              onClick={() => onGoToHole(summary.next!.hole!)}
              className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              Continue mapping
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {states.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={review === s.key}
            title={s.ready ? `${s.label}` : `${s.missing.length} to fix`}
            onClick={() => {
              setReview((v) => (v === s.key ? null : s.key));
              setOpen(true);
            }}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              s.ready ? "border-success/40 text-success" : "border-border text-muted-foreground"
            } ${review === s.key ? "bg-muted" : ""}`}
          >
            {s.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
            {s.ready ? s.label : `${s.label.replace(" ready", "")}: ${s.missing.length} to fix`}
          </button>
        ))}
      </div>
      {open ? (
        shown.length ? (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {shown.map((w, i) => (
              <li key={`${w.code}-${w.hole ?? "c"}-${i}`}>
                {w.hole ? (
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1 text-left hover:bg-muted"
                    onClick={() => onGoToHole(w.hole!)}
                  >
                    {w.message}
                  </button>
                ) : (
                  <span className="block px-2 py-1">{w.message}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted-foreground">{review ? "Nothing left to fix here." : "Everything checks out. This map is ready to publish."}</p>
        )
      ) : null}
    </section>
  );
}
