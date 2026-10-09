import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TrackedEventUpdate = {
  id: string;
  field: string;
  from_value: string | null;
  to_value: string | null;
  source: string | null;
  severity: string | null;
  member_id: string | null;
  created_at: string;
};

export interface EventUpdatesCardProps {
  updates: TrackedEventUpdate[];
  /** Crew member id → display name, so a change reads as a person. */
  memberNames?: Record<string, string>;
}

const FIELD_LABEL: Record<string, string> = {
  tee_time: "Tee time",
  card_number: "Card",
  division: "Division",
  status: "Player status",
  event_status: "Event status",
  event_date: "Event date",
  location: "Location",
  round_number: "Round",
  pool: "Pool",
  course_name: "Course",
  course_layout: "Layout",
  start_type: "Start format",
  round_status: "Round",
  round_score: "Round score",
  position: "Position",
};

const SEVERITY_TONE: Record<string, string> = {
  warning: "border-amber-500/40 text-amber-500",
  alert: "border-rose-500/40 text-rose-500",
  info: "border-border text-muted-foreground",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function value(v: string | null): string {
  if (v == null || v === "") return "not set";
  return v.replace(/_/g, " ");
}

/**
 * Everything that has changed on this event since it was tracked — tee times
 * moved, divisions switched, players withdrawn, the event itself cancelled.
 */
export function EventUpdatesCard({ updates, memberNames = {} }: EventUpdatesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Event updates
          </CardTitle>
          {updates.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {updates.length} change{updates.length === 1 ? "" : "s"} recorded
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has changed since you started tracking this event. Tee time moves, division
            switches and withdrawals will show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => {
              const who = u.member_id ? memberNames[u.member_id] : null;
              return (
                <li key={u.id} className="rounded-md border p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {who ? `${who} — ` : ""}
                      {FIELD_LABEL[u.field] ?? u.field.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground">
                      {value(u.from_value)} → {value(u.to_value)}
                    </span>
                    {u.severity && u.severity !== "info" && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${SEVERITY_TONE[u.severity] ?? ""}`}
                      >
                        {u.severity}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {when(u.created_at)}
                    {u.source ? ` · ${u.source === "sync" ? "picked up automatically" : u.source}` : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
