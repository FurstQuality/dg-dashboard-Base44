import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Play as PlayIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type PlayHistory = {
  rounds7: number;
  rounds30: number;
  courses: number;
  last: { course: string | null; when: string } | null;
};

const shortDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "";

function Metric({ value, label, to }: { value: number; label: string; to: "/play" | "/courses" }) {
  return (
    <Link
      to={to}
      className="flex min-w-0 items-baseline gap-1.5 rounded-control border border-border bg-background px-2.5 py-1.5 transition hover:border-primary/40"
    >
      <span className="text-lg font-semibold tabular-nums leading-none text-foreground">
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}

export function PlayActivitySummary({ userId }: { userId?: string | null }) {
  const historyQ = useQuery<PlayHistory>({
    queryKey: ["play-overview", "activity", userId ?? null],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return { rounds7: 0, rounds30: 0, courses: 0, last: null };
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data } = await supabase
        .from("rounds")
        .select("id, started_at, course_id")
        .eq("created_by", userId)
        .eq("status", "completed")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(60);
      const rows = data ?? [];
      const weekAgo = Date.now() - 7 * 864e5;
      const courses = new Set(rows.map((r) => r.course_id).filter(Boolean) as string[]);
      let last: PlayHistory["last"] = null;
      if (rows[0]) {
        let name: string | null = null;
        if (rows[0].course_id) {
          const { data: c } = await supabase
            .from("courses")
            .select("name")
            .eq("id", rows[0].course_id)
            .maybeSingle();
          name = c?.name ?? null;
        }
        last = { course: name, when: rows[0].started_at as string };
      }
      return {
        rounds7: rows.filter((r) => new Date(r.started_at as string).getTime() >= weekAgo).length,
        rounds30: rows.length,
        courses: courses.size,
        last,
      };
    },
  });

  const h = historyQ.data;

  return (
    <section
      aria-label="Your recent play"
      className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-card px-3 py-2"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <PlayIcon className="h-3.5 w-3.5 text-primary" />
        Recent play
      </span>
      {historyQ.isPending && userId ? (
        <Skeleton className="h-8 w-64 rounded-control" />
      ) : (
        <>
          <Metric value={h?.rounds7 ?? 0} label="this week" to="/play" />
          <Metric value={h?.rounds30 ?? 0} label="last 30 days" to="/play" />
          <Metric value={h?.courses ?? 0} label="courses" to="/courses" />
          <Link
            to="/play"
            className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {h?.last
                ? `Last: ${h.last.course ?? "Unnamed course"} · ${shortDate(h.last.when)}`
                : "No finished rounds in the last 30 days."}
            </span>
          </Link>
        </>
      )}
    </section>
  );
}
