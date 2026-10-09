import { useEffect, useState } from "react";
import { getMyPrefs } from "@/lib/platform-config.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Eye,
  Loader2,
  MapPin,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { friendEventDraft } from "@/lib/share-to-feed";
import { listFriendEvents } from "@/lib/tracker-friends.functions";
import { trackEventByPdgaRef } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";

function formatRange(start: string | null, end: string | null): string {
  if (!start) return "Dates TBD";
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

const SEEN_KEY = "dgd:crew-signups-seen";

function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeSeen(keys: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(-400)));
  } catch {
    /* storage unavailable — sign-ups are simply re-flagged next visit */
  }
}

/**
 * Upcoming events with at least one of the caller's friends in PDGA's published
 * field, plus a warning when the dates collide with something the caller has
 * already committed to. New sign-ups since your last visit are flagged, and
 * announced once when the "crew event sign-ups" alert is on.
 */
export function FriendsPlayingPanel({
  onPreview,
  bare = false,
}: {
  onPreview?: (eventRef: string) => void;
  bare?: boolean;
}) {
  const load = useServerFn(listFriendEvents);
  const track = useServerFn(trackEventByPdgaRef);
  const loadPrefs = useServerFn(getMyPrefs);
  const queryClient = useQueryClient();
  const [savingRef, setSavingRef] = useState<string | null>(null);
  const [freshRefs, setFreshRefs] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: trackerKeys.friendEvents(),
    queryFn: () => load(),
    staleTime: TRACKER_STALE.watchlist,
  });
  const { data: prefs } = useQuery({
    queryKey: ["prefs", "notifications"],
    queryFn: () => loadPrefs(),
    staleTime: 10 * 60_000,
  });

  // Flag sign-ups this device hasn't seen yet, then remember them.
  useEffect(() => {
    if (!data?.events?.length) return;
    const seen = new Set(readSeen());
    const keys: string[] = [];
    const fresh = new Set<string>();
    for (const event of data.events) {
      for (const friend of event.friends) {
        const key = `${event.eventRef}:${friend.pdgaNumber}`;
        keys.push(key);
        if (!seen.has(key)) fresh.add(event.eventRef);
      }
    }
    if (!fresh.size) return;
    setFreshRefs(fresh);
    writeSeen([...seen, ...keys]);
    if (
      seen.size &&
      prefs?.notifications.channels.inApp &&
      prefs.notifications.topics.friendEventSignups
    ) {
      const count = fresh.size;
      toast.info(
        count === 1 ? "A crew member signed up for an event" : `${count} new crew event sign-ups`,
        { description: "Open your Crew Tracker to see who's playing what." },
      );
    }
  }, [data, prefs]);

  const trackIt = async (event: {
    eventRef: string;
    name: string | null;
    startDate: string | null;
    location: string | null;
    tier: string | null;
  }) => {
    setSavingRef(event.eventRef);
    try {
      const res = await track({
        data: {
          pdga_event_ref: event.eventRef,
          name: event.name ?? `PDGA event #${event.eventRef}`,
          event_date: event.startDate,
          location: event.location,
          tier: event.tier,
          url: `https://www.pdga.com/tour/event/${event.eventRef}`,
        },
      });
      toast[res.created ? "success" : "info"](
        res.created ? "Added to your tracker" : "You're already tracking this one",
      );
      void queryClient.invalidateQueries({ queryKey: trackerKeys.watchlist() });
      void queryClient.invalidateQueries({ queryKey: trackerKeys.friendEvents() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that event");
    } finally {
      setSavingRef(null);
    }
  };

  const events = data?.events ?? [];

  return (
    <Card className={bare ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Friends' upcoming events
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Events your friends are registered for on PDGA, so you can sign up alongside them.
        </p>
      </CardHeader>
      <CardContent className={bare ? "space-y-3 p-0" : "space-y-3"}>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking who's registered…
          </div>
        ) : isError ? (
          <p className="py-6 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "We couldn't load your friends' events just now."}
          </p>
        ) : !events.length ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
            {data && data.friendsTotal === 0
              ? "Add friends on DG Dashboard and their upcoming PDGA events show up here. Crew players you follow appear in the Crews tab."
              : data && data.friendsWithPdga === 0
                ? "None of your friends have linked a PDGA number yet, so there's no field to match against."
                : "No friends are registered for an upcoming event that PDGA has published yet."}
          </div>
        ) : (
          events.map((event) => (
            <div key={event.eventRef} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {event.name ?? `PDGA event #${event.eventRef}`}
                    </span>
                    {event.tier ? (
                      <Badge variant="secondary" className="text-[11px]">
                        {event.tier}
                      </Badge>
                    ) : null}
                    {event.tracked ? (
                      <Badge variant="outline" className="gap-1 text-[11px]">
                        <Check className="h-3 w-3" /> Tracking
                      </Badge>
                    ) : null}
                    {freshRefs.has(event.eventRef) ? (
                      <Badge className="text-[11px]">New sign-up</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />{" "}
                      {formatRange(event.startDate, event.endDate)}
                    </span>
                    {event.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {event.location}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5" /> {event.friends.length}{" "}
                      {event.friends.length === 1 ? "friend" : "friends"} registered
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onPreview ? (
                    <Button size="sm" variant="outline" onClick={() => onPreview(event.eventRef)}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                    </Button>
                  ) : null}
                  {!event.tracked ? (
                    <Button
                      size="sm"
                      disabled={savingRef === event.eventRef}
                      onClick={() => void trackIt(event)}
                    >
                      {savingRef === event.eventRef ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Track it too
                    </Button>
                  ) : null}
                  <ShareToFeedButton
                    draft={friendEventDraft({
                      eventName: event.name ?? `PDGA event #${event.eventRef}`,
                      startDate: event.startDate,
                      location: event.location,
                      friendNames: event.friends.map((f) => f.displayName),
                    })}
                    size="sm"
                    variant="ghost"
                    label="Share"
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {event.friends.map((friend) => (
                  <span
                    key={friend.pdgaNumber}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">{friend.displayName}</span>
                    <span className="text-muted-foreground">
                      {friend.division ?? "Division not published"} ·{" "}
                      {friend.rating ? `${friend.rating}` : "no rating published"}
                    </span>
                  </span>
                ))}
              </div>

              {event.conflicts.length ? (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    Overlaps with{" "}
                    {event.conflicts
                      .map((c) => `${c.title} (${formatRange(c.startDate, c.endDate)})`)
                      .join(", ")}
                    . You'd have to pick one.
                  </span>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
