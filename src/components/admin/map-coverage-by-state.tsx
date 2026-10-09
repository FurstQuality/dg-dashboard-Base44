import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMapCoverageByState } from "@/lib/course-geometry/harvest.functions";

/** National starter-map target: how many courses in each state have a usable map. */
export function MapCoverageByState() {
  const fn = useServerFn(getMapCoverageByState);
  const q = useQuery({ queryKey: ["map-coverage-by-state"], queryFn: () => fn(), staleTime: 5 * 60_000 });
  const rows = q.data ?? [];
  const t = rows.reduce((a, r) => ({ courses: a.courses + r.courses, starter: a.starter + r.starter + r.verified, partial: a.partial + r.partial, verified: a.verified + r.verified }), { courses: 0, starter: 0, partial: 0, verified: 0 });
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">Course maps by state</h2>
      <p className="text-sm text-muted-foreground">
        A community map has at least half its holes with a real tee pad and basket. Verified means every hole is mapped and a steward looks after the course.
      </p>
      {q.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Counting…</p> : q.isError ? <p className="mt-2 text-sm text-destructive">Couldn't count map coverage right now.</p> : (
        <>
          <p className="mt-2 text-sm">
            <span className="font-semibold tabular-nums">{t.starter.toLocaleString()}</span> of {t.courses.toLocaleString()} courses have a usable map
            ({t.courses ? ((t.starter / t.courses) * 100).toFixed(1) : 0}%) · {t.partial} partly mapped · {t.verified} verified
          </p>
          <table className="mt-3 w-full table-fixed text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">State</th><th>Courses</th><th>Usable map</th><th>Partly</th><th>Not yet</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 60).map((r) => (
                <tr key={r.state} className="tabular-nums"><td className="py-1 font-medium">{r.state}</td><td>{r.courses}</td><td>{r.starter + r.verified}</td><td>{r.partial}</td><td>{r.unmapped}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
