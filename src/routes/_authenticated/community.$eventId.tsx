import { EventCancelActions } from "@/components/director/event-cancel-actions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  CalendarPlus,
  MapPin,
  Users,
  Check,
  X,
  Sparkles,
  Award,
  MessageCircle,
  MessagesSquare,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton, MascotEmptyState } from "@/components/shell";
import { CommunityErrorState } from "@/components/community/community-error-state";
import { EVENT_KIND_LABEL, EVENT_KIND_STYLE } from "@/lib/gamification-utils";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { openDirectConversation } from "@/lib/messaging";
import { joinDgimEventChat } from "@/lib/dgim";
import { EventInvitePanel } from "@/components/events/event-invite-panel";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { TrackEventButton } from "@/components/tracker/track-event-button";
import { eventDraft } from "@/lib/share-to-feed";
import { downloadEventIcs } from "@/lib/community-ics";
import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";
import {
  getOutreachEventDetail,
  setOutreachAttendance,
  setOutreachRsvp,
} from "@/lib/community.functions";

export const Route = createFileRoute("/_authenticated/community/$eventId")({
  component: EventDetailPage,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This event" />,
  head: () => ({
    meta: [
      { title: "Community event · DG Dashboard" },
      {
        name: "description",
        content: "RSVP, view attendees, and coordinate a disc golf community event.",
      },
      { property: "og:title", content: "Community event · DG Dashboard" },
      { property: "og:description", content: "Disc golf community event." },
    ],
  }),
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openingChat, setOpeningChat] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchDetail = useServerFn(getOutreachEventDetail);
  const rsvpFn = useServerFn(setOutreachRsvp);
  const attendanceFn = useServerFn(setOutreachAttendance);

  const detailQuery = useQuery({
    queryKey: communityKeys.outreachDetail(user?.id, eventId),
    queryFn: () => fetchDetail({ data: { eventId } }),
    staleTime: COMMUNITY_STALE.short,
  });

  const detail = detailQuery.data ?? null;
  const event = detail?.event ?? null;
  const attendees = detail?.attendees ?? [];
  const myRsvp = detail?.myRsvp ?? null;
  const isHost = detail?.isHost ?? false;
  const goingCount = event?.goingCount ?? 0;

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: communityKeys.outreachDetail(user?.id, eventId),
    });

  async function messageUser(otherId: string) {
    if (!user || otherId === user.id) return;
    const convId = await openDirectConversation(user.id, otherId);
    if (convId) navigate({ to: "/dgim", search: { conv: convId } });
  }

  /** Opens (creating on first use) the DGIM room shared by everyone at this event. */
  async function openEventChat() {
    if (!event) return;
    setOpeningChat(true);
    try {
      const convId = await joinDgimEventChat("community", event.id);
      navigate({ to: "/dgim", search: { conv: convId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the event chat.");
    } finally {
      setOpeningChat(false);
    }
  }

  async function setStatus(status: "going" | "maybe" | "declined") {
    if (!event || busy) return;
    setBusy(true);
    try {
      await rsvpFn({ data: { eventId: event.id, status } });
      toast.success(status === "going" ? "You're going!" : "RSVP updated");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that RSVP");
    } finally {
      setBusy(false);
    }
  }

  async function markAttended(playerId: string, attended: boolean) {
    if (!event || busy) return;
    setBusy(true);
    try {
      await attendanceFn({ data: { eventId: event.id, playerId, attended } });
      toast.success(attended ? "Marked attended · +200 XP awarded" : "Attendance cleared");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update attendance");
    } finally {
      setBusy(false);
    }
  }

  if (detailQuery.isLoading) {
    return (
      <PageShell section="community">
        <LoadingSkeleton variant="card" count={2} />
      </PageShell>
    );
  }
  if (detailQuery.isError) {
    return (
      <PageShell section="community">
        <CommunityErrorState
          title="This event didn't load"
          message="We couldn't reach the event details just now."
          onRetry={() => void detailQuery.refetch()}
        />
      </PageShell>
    );
  }
  if (!event) {
    return (
      <PageShell section="community">
        <MascotEmptyState
          intent="scout"
          title="Event not found"
          description="This community event may have been removed or is no longer available."
          actions={
            <Button asChild size="sm" variant="outline">
              <Link to="/community/events">Browse outreach events</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }


  return (
    <PageShell section="community">

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {event.cover_url ? (
          <div
            className="h-56 bg-cover bg-center"
            style={{ backgroundImage: `url(${event.cover_url})` }}
          />
        ) : (
          <div className="h-56 bg-gradient-to-br from-primary/25 via-primary/5 to-transparent" />
        )}
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase " +
                (EVENT_KIND_STYLE[event.kind] ?? "")
              }
            >
              {EVENT_KIND_LABEL[event.kind] ?? event.kind}
            </span>
            {event.cause ? (
              <span className="text-xs text-muted-foreground">For {event.cause}</span>
            ) : null}
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold">{event.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Date(event.starts_at).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {event.ends_at
                ? ` – ${new Date(event.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                : ""}
            </span>
            {event.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {event.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {goingCount} going
              {event.capacity ? ` / ${event.capacity}` : ""}
            </span>
            {event.capacity && goingCount >= event.capacity ? (
              <span className="font-medium text-amber-500">
                At capacity — RSVP to join the waitlist.
              </span>
            ) : null}
          </div>
          {event.description ? (
            <p className="mt-4 whitespace-pre-wrap text-sm">{event.description}</p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant={myRsvp === "going" ? "default" : "outline"}
              onClick={() => setStatus("going")}
            >
              <Check className="mr-1.5 h-4 w-4" /> Going
            </Button>
            {!isHost && event.host_id ? (
              <Button variant="outline" onClick={() => messageUser(event.host_id)}>
                <MessageCircle className="mr-1.5 h-4 w-4" /> Message host
              </Button>
            ) : null}
            {isHost ? (
              <EventCancelActions
                kind="community"
                id={event.id}
                name={event.title}
                cancelled={event.status === "cancelled"}
                onChanged={() => void detailQuery.refetch()}
              />
            ) : null}
            <Button variant="outline" onClick={openEventChat} disabled={openingChat}>
              {openingChat ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MessagesSquare className="mr-1.5 h-4 w-4" />
              )}
              Event chat in DGIM
            </Button>
            <Button variant="outline" onClick={() => downloadEventIcs(event)}>
              <CalendarPlus className="mr-1.5 h-4 w-4" /> Add to calendar
            </Button>
            <ShareToFeedButton
              size="default"
              label="Share to feed"
              title="Share this event"
              draft={() => eventDraft(event)}
            />
            <TrackEventButton
              size="default"
              event={{
                eventRef: `dgd-community-${event.id}`,
                name: event.title,
                eventDate: event.starts_at.slice(0, 10),
                location: event.location,
              }}
            />


            <Button
              variant={myRsvp === "maybe" ? "default" : "outline"}
              onClick={() => setStatus("maybe")}
            >
              Maybe
            </Button>
            <Button
              variant={myRsvp === "declined" ? "default" : "outline"}
              onClick={() => setStatus("declined")}
            >
              <X className="mr-1.5 h-4 w-4" /> Can't make it
            </Button>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> +200 XP when host marks you attended
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Attendees</h2>
          {isHost ? (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <Award className="h-3.5 w-3.5" /> Host tools
            </span>
          ) : null}
        </div>
        {attendees.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody's RSVPed yet — be the first to say you're in.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {attendees.map((a) => (
              <li key={a.user_id} className="flex items-center gap-3 py-2">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-semibold">
                  {a.display_name?.slice(0, 2).toUpperCase() ?? "??"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {a.display_name ?? "Player"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    @{a.username ?? ""} · {a.status}
                    {a.attended ? " · ✅ attended" : ""}
                  </div>
                </div>
                {a.user_id !== user?.id ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => messageUser(a.user_id)}
                    title="Message"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {isHost && a.status === "going" ? (
                  <Button
                    size="sm"
                    variant={a.attended ? "default" : "outline"}
                    onClick={() => markAttended(a.user_id, !a.attended)}
                  >
                    {a.attended ? "Attended" : "Mark attended"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isHost ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <EventInvitePanel
            eventKind="community"
            eventId={event.id}
            eventTitle={event.title}
            eventStartsAt={event.starts_at}
            eventLocation={event.location ?? undefined}
          />
        </section>
      ) : null}
    </PageShell>
  );
}
