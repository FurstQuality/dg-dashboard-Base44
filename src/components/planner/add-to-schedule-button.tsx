/**
 * Adds a planner occurrence to the player's personal schedule. Recurring league
 * nights are saved with their weekday so the schedule can repeat them.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { upsertScheduledEvent } from "@/lib/scheduled-events.functions";
import { DOW_LONG, type PlannerOccurrence } from "@/lib/planner";

export function AddToScheduleButton({
  occurrence,
  size = "sm",
  variant = "secondary",
  className,
}: {
  occurrence: PlannerOccurrence;
  size?: "sm" | "default" | "icon";
  variant?: "secondary" | "outline" | "ghost";
  className?: string;
}) {
  const save = useServerFn(upsertScheduledEvent);
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  const isInternalTournament = occurrence.eventId.startsWith("t:");
  const isInternalLeague = occurrence.eventId.startsWith("l:");
  const uuid = occurrence.eventId.slice(2);

  async function add() {
    setState("saving");
    try {
      await save({
        data: {
          source: occurrence.source === "pdga" ? "pdga" : isInternalLeague ? "league" : isInternalTournament ? "tournament" : "manual",
          status: "interested",
          title: occurrence.title,
          starts_on: occurrence.date,
          ends_on: occurrence.endDate,
          location: occurrence.courseName ?? occurrence.location ?? undefined,
          city: occurrence.city ?? undefined,
          state: occurrence.state ?? undefined,
          tier: occurrence.tier ?? undefined,
          event_url: occurrence.externalUrl ?? undefined,
          entry_fee_cents: occurrence.entryFeeCents ?? undefined,
          tournament_id: isInternalTournament ? uuid : undefined,
          league_id: isInternalLeague ? uuid : undefined,
          recurrence_dow: occurrence.recurring ? occurrence.dow : null,
        },
      });
      setState("saved");
      await queryClient.invalidateQueries({ queryKey: ["scheduled-events"] });
      toast.success(
        occurrence.recurring
          ? `Added ${DOW_LONG[occurrence.dow]} nights at ${occurrence.title} to your schedule`
          : `Added ${occurrence.title} to your schedule`,
      );
    } catch (err) {
      setState("idle");
      toast.error(err instanceof Error ? err.message : "Could not add that to your schedule");
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={() => void add()}
      disabled={state !== "idle"}
    >
      {state === "saving" ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : state === "saved" ? (
        <Check className="mr-1 h-4 w-4" />
      ) : (
        <CalendarPlus className="mr-1 h-4 w-4" />
      )}
      {state === "saved" ? "On your schedule" : "Add to schedule"}
    </Button>
  );
}
