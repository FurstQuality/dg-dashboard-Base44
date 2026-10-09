import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Summary = {
  courses: number;
  location: Record<string, number> | null;
  sources: Record<string, number> | null;
  snapshots: number;
  observations: number;
  pending_matches: number;
  holes: number;
  par_confirmed: number;
  states: { state: string; courses: number; exact_pins: number }[] | null;
};

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

/** One glance at every stage of the course data pipeline, with per-state coverage. */
export function CourseDataSummary() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "course-data-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_data_engine_summary");
      if (error) throw error;
      return data as unknown as Summary;
    },
    staleTime: 60_000,
  });
  if (isLoading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  if (isError || !data) return <p className="text-sm text-muted-foreground">Course data totals couldn't load. Try refreshing.</p>;
  const loc = data.location ?? {};
  const exact = (loc.verified_gps ?? 0) + (loc.source_coordinate ?? 0) + (loc.address_geocoded ?? 0) + (loc.park_geocoded ?? 0);
  const src = data.sources ?? {};
  const stages: [string, string, string][] = [
    ["Courses", fmt(data.courses), "one record per real course"],
    ["Exact pins", fmt(exact), `${fmt(loc.city_approximate)} on a town centre · ${fmt(loc.unknown)} no location`],
    ["Listings linked", fmt(Object.values(src).reduce((a, b) => a + b, 0)), `UDisc ${fmt(src.udisc)} · PDGA ${fmt(src.pdga)} · Scene ${fmt(src.disc_golf_scene ?? src.scene)}`],
    ["Saved listing copies", fmt(data.snapshots), `${fmt(data.observations)} field readings`],
    ["Duplicates to review", fmt(data.pending_matches), "possible same-course pairs"],
    ["Par confirmed", fmt(data.par_confirmed), `of ${fmt(data.holes)} holes`],
  ];
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Course data at a glance</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map(([label, value, hint]) => (
          <div key={label} className="min-w-0 rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{value}</div>
            <div className="truncate text-xs text-muted-foreground">{hint}</div>
          </div>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Coverage by state</summary>
        <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {(data.states ?? []).map((s) => (
            <li key={s.state} className="flex justify-between gap-2 tabular-nums">
              <span className="truncate">{s.state}</span>
              <span className="text-muted-foreground">
                {fmt(s.exact_pins)}/{fmt(s.courses)} exact
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
