/**
 * "Track this event" — one-tap save of any event into the viewer's personal
 * tracker, usable from every event surface (PDGA event pages, in-app
 * tournaments, community events, and event lists).
 *
 * The watchlist query doubles as the tracked-state source, so the button shows
 * "Tracking" without an extra round trip once the event is saved.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { listTrackedEvents, trackEventByPdgaRef } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";

export type TrackEventInput = {
  /** PDGA event ref when sanctioned, otherwise a stable app-side ref. */
  eventRef: string;
  name: string;
  eventDate?: string | null;
  location?: string | null;
  tier?: string | null;
  url?: string | null;
};

export function TrackEventButton({
  event,
  size = "sm",
  variant = "outline",
  className,
  label = "Track this event",
}: {
  event: TrackEventInput;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "secondary" | "ghost";
  className?: string;
  label?: string;
}) {
  const load = useServerFn(listTrackedEvents);
  const track = useServerFn(trackEventByPdgaRef);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const watchlist = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => load(),
    staleTime: TRACKER_STALE.watchlist,
  });

  const tracked = (watchlist.data?.events ?? []).some((e) => e.pdgaEventRef === event.eventRef);

  const onTrack = async () => {
    setSaving(true);
    try {
      const res = await track({
        data: {
          pdga_event_ref: event.eventRef,
          name: event.name,
          event_date: event.eventDate ?? null,
          location: event.location ?? null,
          tier: event.tier ?? null,
          url: event.url ?? null,
        },
      });
      toast[res.created ? "success" : "info"](
        res.created ? "Added to your Event Tracker" : "You're already tracking this one",
      );
      void queryClient.invalidateQueries({ queryKey: trackerKeys.watchlist() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that event");
    } finally {
      setSaving(false);
    }
  };

  if (tracked) {
    return (
      <Button size={size} variant="secondary" className={className} disabled>
        <Check className="mr-1.5 h-4 w-4" /> Tracking
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={onTrack}
      disabled={saving || watchlist.isLoading}
    >
      {saving ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Eye className="mr-1.5 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
