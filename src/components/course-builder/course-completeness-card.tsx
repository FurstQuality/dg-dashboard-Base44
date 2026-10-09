import { CheckCircle2, Circle } from "lucide-react";
import { completeness, type HoleInput } from "@/lib/course-builder/validate";

/** Player-facing "how well mapped is this layout" score with what's still missing. */
export function CourseCompletenessCard({
  layoutName,
  hasBoundary,
  infrastructureCount,
  holes,
}: {
  layoutName: string;
  hasBoundary: boolean;
  infrastructureCount: number;
  holes: HoleInput[];
}) {
  const c = completeness({ hasBoundary, infrastructureCount, holes });
  const n = c.holes;
  const items: [string, boolean][] = [
    ["Course boundary", hasBoundary],
    ["Parking, paths or restrooms", infrastructureCount > 0],
    [`Tees mapped (${c.tees}/${n})`, n > 0 && c.tees === n],
    [`Baskets mapped (${c.baskets}/${n})`, n > 0 && c.baskets === n],
    [`Par set (${c.pars}/${n})`, n > 0 && c.pars === n],
    [`Flight paths (${c.flights}/${n})`, n > 0 && c.flights === n],
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold">Map completeness — {layoutName}</h3>
        <span className="ml-auto text-lg font-semibold tabular-nums">{c.pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${c.pct}%` }} />
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {items.map(([label, done]) => (
          <li key={label} className="flex items-center gap-2">
            {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            <span className={done ? "" : "text-muted-foreground"}>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
