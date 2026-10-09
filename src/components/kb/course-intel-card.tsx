import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCourseIntel } from "@/lib/intel-kb.functions";
import { Sparkles } from "lucide-react";

type Props = { courseId?: string | null; courseName?: string | null };

export function CourseIntelCard({ courseId, courseName }: Props) {
  const run = useServerFn(getCourseIntel);
  const q = useQuery({
    queryKey: ["course-intel", courseId ?? null, courseName ?? null],
    queryFn: () => run({ data: { courseId, courseName } }),
    enabled: Boolean(courseId || courseName),
    staleTime: 5 * 60_000,
  });

  const intel = q.data;
  if (!intel || intel.rounds_count === 0) return null;

  const fmt = (n: number | null, digits = 1) => (n == null ? "—" : n.toFixed(digits));

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Course intelligence
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Learned from {intel.rounds_count} imported round
        {intel.rounds_count === 1 ? "" : "s"}
        {intel.pdga_rounds_count > 0 ? ` (${intel.pdga_rounds_count} PDGA-sanctioned)` : ""}.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Avg SSA" value={fmt(intel.avg_ssa, 1)} />
        <Stat label="Stroke value" value={fmt(intel.avg_stroke_value, 2)} />
        <Stat label="Avg rating" value={fmt(intel.avg_round_rating, 0)} />
        <Stat label="Best rating" value={intel.best_round_rating ?? "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
