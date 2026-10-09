import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Coverage = { pdga: number; udisc: number; disc_golf_scene: number; multi: number; single: number; none: number };
type Reason = { status: string; reason: string; n: number };

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

/** Source-link coverage plus the reasons source listings were set aside. */
export function CourseSourceReview() {
  const coverage = useQuery({
    queryKey: ["admin", "course-source-coverage"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_source_coverage");
      if (error) throw error;
      return data as unknown as Coverage;
    },
  });
  const reasons = useQuery({
    queryKey: ["admin", "course-set-aside-reasons"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_listing_set_aside_reasons");
      if (error) throw error;
      return (data ?? []) as unknown as Reason[];
    },
  });
  const c = coverage.data;
  const tiles: [string, number | undefined, string][] = c
    ? [
        ["Several listings", c.multi, "linked to two or more sources"],
        ["One listing", c.single, "only one source so far"],
        ["No listing", c.none, "added in the app or from open map data"],
        ["UDisc linked", c.udisc, ""],
        ["PDGA linked", c.pdga, ""],
        ["Disc Golf Scene linked", c.disc_golf_scene, ""],
      ]
    : [];
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Source listings</h2>
      {coverage.isError && <p className="text-sm text-muted-foreground">Listing coverage couldn't load. Try refreshing.</p>}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="min-w-0 rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{fmt(value)}</div>
            {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
          </div>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Why listings were set aside</summary>
        {reasons.isError ? (
          <p className="mt-2 text-sm text-muted-foreground">Reasons couldn't load. Try refreshing.</p>
        ) : (reasons.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing set aside.</p>
        ) : (
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {(reasons.data ?? []).map((r) => (
              <li key={`${r.status}:${r.reason}`} className="flex justify-between gap-3 tabular-nums">
                <span className="truncate">{r.reason}</span>
                <span className="text-muted-foreground">{fmt(r.n)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
