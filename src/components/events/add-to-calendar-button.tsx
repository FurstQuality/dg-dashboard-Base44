/**
 * Adds any directory event — PDGA, Disc Golf Scene, UDisc, or Disc Golf
 * Dashboard — to the player's personal calendar. Saving writes a scheduled
 * event (which the /schedule calendar, Google push, and the ICS feed all read),
 * and the menu also offers a one-off .ics download or a Google Calendar link for
 * players who keep their calendar outside the app.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { upsertScheduledEvent } from "@/lib/scheduled-events.functions";
import { downloadEventIcs } from "@/lib/community-ics";
import type { Source } from "@/components/events/events-types";

export type CalendarCandidate = {
  id: string;
  title: string;
  source: Source;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  tier: string | null;
  external_url?: string | null;
};

const SCHEDULE_SOURCE: Record<Source, "pdga" | "disc_golf_scene" | "udisc" | "manual"> = {
  pdga: "pdga",
  scene: "disc_golf_scene",
  udisc: "udisc",
  chainlink: "manual",
};

/** Accepts only a clean yyyy-mm-dd day; anything else is unusable. */
function dayOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return Number.isNaN(new Date(`${day}T12:00:00Z`).getTime()) ? null : day;
}

function noonIso(date: string): string {
  return new Date(`${date}T18:00:00Z`).toISOString();
}

function googleUrl(event: CalendarCandidate): string | null {
  const startDay = dayOnly(event.start_date);
  if (!startDay) return null;
  const start = startDay.replace(/-/g, "");
  const endDay = dayOnly(event.end_date) ?? startDay;
  const endDate = new Date(`${endDay}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1); // Google end date is exclusive
  const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
  });
  if (event.location) params.set("location", event.location);
  if (event.external_url) params.set("details", event.external_url);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}


export function AddToCalendarButton({
  event,
  size = "sm",
  variant = "outline",
  className,
  label = "Add to calendar",
  ariaLabel,
}: {
  event: CalendarCandidate;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "secondary" | "outline" | "ghost";
  className?: string;
  label?: string;
  ariaLabel?: string;
}) {
  const save = useServerFn(upsertScheduledEvent);
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const gcal = googleUrl(event);

  async function addToSchedule() {
    if (!event.start_date) {
      toast.error("This event has no date yet, so it can't go on your calendar.");
      return;
    }
    setState("saving");
    try {
      await save({
        data: {
          source: SCHEDULE_SOURCE[event.source],
          status: "interested",
          title: event.title,
          starts_on: event.start_date,
          ends_on: event.end_date ?? event.start_date,
          location: event.location ?? undefined,
          tier: event.tier ?? undefined,
          event_url: event.external_url ?? undefined,
        },
      });
      setState("saved");
      await queryClient.invalidateQueries({ queryKey: ["scheduled-events"] });
      await queryClient.invalidateQueries({ queryKey: ["my-schedule"] });
      toast.success(`${event.title} is on your calendar`, {
        description: "Find it under Play › Schedule, or in any calendar you've synced.",
      });
    } catch (err) {
      setState("idle");
      toast.error(err instanceof Error ? err.message : "Couldn't add that to your calendar");
    }
  }

  function download() {
    const startDay = dayOnly(event.start_date);
    if (!startDay) {
      toast.error("This event has no date yet, so there's nothing to download.");
      return;
    }
    downloadEventIcs({
      id: event.id,
      title: event.title,
      location: event.location,
      description: event.external_url,
      starts_at: noonIso(startDay),
      ends_at: noonIso(dayOnly(event.end_date) ?? startDay),
    });
  }


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant={variant}
          className={className}
          aria-label={ariaLabel ?? label}
          disabled={state === "saving"}
          onClick={(e) => e.stopPropagation()}
        >
          {state === "saving" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : state === "saved" ? (
            <Check className="mr-1 h-3.5 w-3.5" />
          ) : (
            <CalendarPlus className="mr-1 h-3.5 w-3.5" />
          )}
          {size === "icon" ? null : state === "saved" ? "On your calendar" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => void addToSchedule()}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          Add to my calendar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download()}>
          <Download className="mr-2 h-4 w-4" />
          Download .ics file
        </DropdownMenuItem>
        {gcal ? (
          <DropdownMenuItem asChild>
            <a href={gcal} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in Google Calendar
            </a>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
