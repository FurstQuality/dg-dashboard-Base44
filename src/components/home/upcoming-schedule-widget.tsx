import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { scheduleQueryOptions } from "@/lib/entities";

function dateParts(iso: string | null): { month: string; day: string } {
  if (!iso) return { month: "—", day: "—" };
  const d = new Date(iso + "T12:00:00");
  return {
    month: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
  };
}

export function UpcomingScheduleWidget({ userId }: { userId: string | undefined }) {
  const { data, isLoading } = useQuery(scheduleQueryOptions(userId, { limit: 3 }));
  const rows = isLoading ? null : (data ?? []);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" /> Upcoming
        </h3>
        <Link to="/schedule" className="text-[11px] font-medium text-primary hover:underline">
          See all
        </Link>
      </div>
      <p className="mb-2 text-[12px] leading-snug text-muted-foreground">
        Your next three commitments — tournaments, league nights, and planned rounds you signed up
        for.
      </p>
      {rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Link
          to="/schedule"
          className="block rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground hover:bg-muted"
        >
          No events scheduled. Add one →
        </Link>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const place = [r.city, r.state].filter(Boolean).join(", ") || r.location || "";
            const { month, day } = dateParts(r.starts_on);
            const isPdga = (r.source ?? "").toLowerCase().includes("pdga") && r.external_id;
            const linkProps = isPdga
              ? {
                  to: "/events/pdga/$eventRef" as const,
                  params: { eventRef: String(r.external_id) },
                }
              : { to: "/schedule" as const };
            return (
              <li key={r.id}>
                <Link
                  {...linkProps}
                  className="flex items-start gap-2.5 rounded-lg p-1.5 text-xs hover:bg-muted"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-primary/10 text-center leading-none text-primary">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wide">{month}</div>
                      <div className="text-sm font-black tabular-nums">{day}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[12.5px] font-semibold leading-tight">
                      {r.title}
                    </div>
                    {place ? (
                      <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{place}</span>
                      </div>
                    ) : null}
                  </div>
                  {r.tier ? (
                    <span className="mt-0.5 shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {r.tier}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
