import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, CheckCircle2, AlertCircle, MinusCircle } from "lucide-react";
import { refreshCourseSources, getCourseSources } from "@/lib/course-auto-populate.functions";

const SOURCE_LABEL: Record<string, string> = {
  pdga: "PDGA",
  dgs: "Disc Golf Scene",
  udisc: "UDisc",
};

const SOURCE_URL_HINT: Record<string, string> = {
  pdga: "Course ratings and event history",
  dgs: "Registration and course metadata",
  udisc: "Layouts, par, and length data",
};

export function CourseDataSources({ courseId }: { courseId: string }) {
  const load = useServerFn(getCourseSources);
  const refresh = useServerFn(refreshCourseSources);
  const qc = useQueryClient();
  const [lastResult, setLastResult] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["course-sources", courseId],
    queryFn: () => load({ data: { courseId } }),
  });

  const m = useMutation({
    mutationFn: () => refresh({ data: { courseId } }),
    onSuccess: (res) => {
      const bits: string[] = [];
      for (const [k, v] of Object.entries(res.sources)) {
        if (v.status === "ok") bits.push(`${SOURCE_LABEL[k]} ✓`);
      }
      setLastResult(bits.length ? bits.join(" · ") : "No matches found");
      if (res.rating_profile.action === "created_pending") {
        toast.success("Auto-submitted a PDGA rating profile for admin review.");
      } else if (res.rating_profile.action === "existing_approved") {
        toast.info("Rating profile already approved for this course.");
      }
      void qc.invalidateQueries({ queryKey: ["course-sources", courseId] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    },
  });

  const sources = q.data?.sources ?? [];
  const layouts = q.data?.layouts ?? [];
  const byKey = new Map(sources.map((s) => [s.source, s]));

  // First-view auto-populate: if no sources have been fetched yet for this
  // course, kick off a background search so the catalog grows organically.
  useEffect(() => {
    if (!q.isSuccess) return;
    if (sources.length > 0) return;
    if (m.isPending || m.isSuccess || m.isError) return;
    m.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess, sources.length]);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div>
          <h3 className="text-base font-semibold">Data sources</h3>
          <p className="text-xs text-muted-foreground">
            We pull course data from PDGA, Disc Golf Scene, and UDisc automatically and keep it up
            to date for you.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {m.isPending ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Checking all three sources…
            </span>
          ) : lastResult ? (
            <span className="text-xs text-muted-foreground">{lastResult}</span>
          ) : null}
          <button
            type="button"
            onClick={() => m.mutate()}
            disabled={m.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={"h-3.5 w-3.5" + (m.isPending ? " animate-spin" : "")} aria-hidden />
            Check sources now
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {(["pdga", "dgs", "udisc"] as const).map((key) => {
          const row = byKey.get(key);
          const status = row ? (row.last_error ? "error" : "ok") : "empty";
          return (
            <div key={key} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{SOURCE_LABEL[key]}</div>
                  <div className="text-xs text-muted-foreground">{SOURCE_URL_HINT[key]}</div>
                </div>
                {status === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                ) : (
                  <MinusCircle className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              {row?.matched_name ? (
                <div className="mt-2 text-sm">{row.matched_name}</div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">
                  {status === "empty" ? "Not searched yet." : "No match found."}
                </div>
              )}
              {row?.canonical_url ? (
                <a
                  href={row.canonical_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {row ? (
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Confidence {row.confidence}%</span>
                  <span>
                    {row.last_fetched_at ? new Date(row.last_fetched_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              ) : null}
              {row?.last_error ? (
                <div className="mt-1 text-[11px] text-amber-600">{row.last_error}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {layouts.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Discovered layouts
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Layout</th>
                  <th className="px-3 py-2 text-right">Holes</th>
                  <th className="px-3 py-2 text-right">Par</th>
                  <th className="px-3 py-2 text-right">Length (ft)</th>
                </tr>
              </thead>
              <tbody>
                {layouts.map((l, i) => (
                  <tr key={`${l.source}-${l.layout_name}-${i}`} className="border-t border-border">
                    <td className="px-3 py-2 uppercase tracking-wide text-xs text-muted-foreground">
                      {l.source}
                    </td>
                    <td className="px-3 py-2">{l.layout_name}</td>
                    <td className="px-3 py-2 text-right">{l.holes ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{l.par ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {l.length_ft ? l.length_ft.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
