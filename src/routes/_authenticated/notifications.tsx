import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Heart,
  MessageCircle,
  UserPlus,
  UserCheck,
  Users,
  Bell,
  Trophy,
  Calendar,
  AtSign,
  Repeat2,
  ShieldCheck,

} from "lucide-react";
import { useSession, timeAgo, initials } from "@/lib/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PushPermissionGate } from "@/components/push-permission-gate";
import { PageShell, PageHeader } from "@/components/shell";
import {
  notificationsQueryOptions,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/entities/notifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Notifications · DG Dashboard" },
      {
        name: "description",
        content: "Likes, comments, follows, and event alerts from DG Dashboard.",
      },
      { property: "og:title", content: "Notifications · DG Dashboard" },
      { property: "og:description", content: "Your DG Dashboard activity feed." },
    ],
  }),
});

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  friend_request: UserPlus,
  friend_accept: UserCheck,
  crew_added: Users,
  event: Calendar,
  club_invite: Users,
  mention: AtSign,
  share: Repeat2,
  message: MessageCircle,
  achievement: Trophy,
  report_resolved: ShieldCheck,
};

const TEXT: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "followed you",
  mention: "mentioned you",
  share: "shared your post",
  friend_request: "sent you a friend request",
  friend_accept: "accepted your friend request",
  crew_added: "added you to their crew",
  event: "invited you to an event",
  club_invite: "invited you to a club",
  message: "sent you a message",
  achievement: "unlocked an achievement",
  report_resolved: "reviewed a post you reported",
};

/** Event name when this row is a friend tracking the same tournament. */
function trackedEventName(n: {
  type: string;
  data?: Record<string, unknown> | null;
}): string | null {
  if (n.type !== "event") return null;
  const data = n.data ?? null;
  if (!data || data["kind"] !== "friend_tracking_event") return null;
  const name = data["event_name"];
  return typeof name === "string" && name ? name : null;
}

/** Marketplace/lost-and-found payload for rows the database writes with a title/body/link. */
function marketplacePayload(n: { type: string; data?: Record<string, unknown> | null }): {
  title: string;
  body: string;
  link: string;
} | null {
  const data = n.data ?? null;
  if (!data) return null;
  const kind = data["kind"];
  if (
    kind !== "marketplace_match" &&
    kind !== "marketplace_saved_search" &&
    kind !== "marketplace_watch"
  ) {
    return null;
  }
  const title = typeof data["title"] === "string" ? (data["title"] as string) : "";
  if (!title) return null;
  return {
    title,
    body: typeof data["body"] === "string" ? (data["body"] as string) : "",
    link: typeof data["link"] === "string" ? (data["link"] as string) : "/marketplace",
  };
}

/** Human sentence for a notification row, payload-aware where it matters. */
function notifText(n: { type: string; data?: Record<string, unknown> | null }): string {
  const tracked = trackedEventName(n);
  if (tracked) return `is tracking ${tracked} — an event you're registered for`;
  if (n.type === "report_resolved") {
    const resolution = n.data?.["resolution"];
    return resolution === "hidden"
      ? "reviewed a post you reported and removed it from feeds"
      : "reviewed a post you reported and left it up";
  }
  return TEXT[n.type] ?? "sent an update";
}

type Filter = "all" | "unread" | "social" | "community";

const FILTER_TYPES: Record<Filter, string[] | null> = {
  all: null,
  unread: null,
  social: [
    "like",
    "comment",
    "follow",
    "mention",
    "share",
    "friend_request",
    "friend_accept",
    "crew_added",
  ],
  community: ["event", "club_invite", "message", "achievement", "report_resolved"],
};

function bucketLabel(iso: string): "Today" | "This week" | "Earlier" {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const day = 86400_000;
  if (now - t < day && new Date(iso).toDateString() === new Date().toDateString()) return "Today";
  if (now - t < 7 * day) return "This week";
  return "Earlier";
}

function NotificationsPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const { data: items = [] } = useQuery(notificationsQueryOptions(user?.id));
  const [filter, setFilter] = useState<Filter>("all");
  // Snapshot the unread IDs from the first render so items keep their
  // "unread" highlight even after we mark them read on unmount.
  const initialUnread = useRef<Set<string> | null>(null);
  if (initialUnread.current === null && items.length > 0) {
    initialUnread.current = new Set(items.filter((n) => !n.read_at).map((n) => n.id));
  }

  // Mark everything read when the user leaves the page (not on first paint),
  // so the visual "new" state stays visible while they're reading.
  useEffect(() => {
    return () => {
      if (user?.id && (initialUnread.current?.size ?? 0) > 0) {
        void markAllNotificationsRead(user.id);
      }
    };
  }, [user?.id]);

  const unreadCount = initialUnread.current?.size ?? 0;

  const filtered = useMemo(() => {
    if (filter === "unread") return items.filter((n) => initialUnread.current?.has(n.id));
    const types = FILTER_TYPES[filter];
    if (!types) return items;
    return items.filter((n) => types.includes(n.type));
  }, [items, filter]);

  const grouped = useMemo(() => {
    const g: Record<string, NotificationRow[]> = { Today: [], "This week": [], Earlier: [] };
    for (const n of filtered) g[bucketLabel(n.created_at)].push(n);
    return g;
  }, [filtered]);

  return (
    <PageShell narrow>
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `You have ${unreadCount} new update${unreadCount === 1 ? "" : "s"} since your last visit.`
            : "Likes, comments, follows, and event alerts from your crew and events."
        }
      />
      <PushPermissionGate />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-10 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              {filter === "unread"
                ? "No unread notifications — you're all caught up."
                : "Nothing here yet."}
            </div>
          </div>
        ) : (
          (["Today", "This week", "Earlier"] as const).map((bucket) => {
            const rows = grouped[bucket];
            if (!rows || rows.length === 0) return null;
            return (
              <section key={bucket}>
                <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {bucket}
                </h2>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {rows.map((n) => {
                    const Icon = ICON[n.type] ?? Bell;
                    const isUnread = initialUnread.current?.has(n.id) ?? false;
                    const market = marketplacePayload(n);
                    return (
                      <div
                        key={n.id}
                        className={
                          "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 " +
                          (isUnread ? "bg-primary/5" : "")
                        }
                      >
                        {isUnread ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-primary"
                            aria-label="Unread"
                          />
                        ) : (
                          <span className="h-2 w-2 shrink-0" />
                        )}
                        <Avatar className="h-9 w-9">
                          {n.actor?.avatar_url ? <AvatarImage src={n.actor.avatar_url} /> : null}
                          <AvatarFallback>
                            {initials(n.actor?.display_name ?? undefined)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 text-sm">
                          {market ? (
                            <>
                              <div className="font-semibold">{market.title}</div>
                              {market.body ? (
                                <div className="text-muted-foreground">{market.body}</div>
                              ) : null}
                              <div className="text-xs text-muted-foreground">
                                {timeAgo(n.created_at)}
                              </div>
                            </>
                          ) : n.actor ? (
                            <Link
                              to="/u/$username"
                              params={{ username: n.actor.username }}
                              className="font-semibold hover:underline"
                            >
                              {n.actor.display_name ?? n.actor.username}
                            </Link>
                          ) : (
                            <span className="font-semibold">Someone</span>
                          )}
                          {market ? null : (
                            <>
                              {" "}
                              <span className="text-muted-foreground">{notifText(n)}</span>
                              <div className="text-xs text-muted-foreground">
                                {timeAgo(n.created_at)}
                              </div>
                            </>
                          )}

                        </div>
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {market ? (
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() =>
                              navigate({ to: market.link } as unknown as Parameters<
                                typeof navigate
                              >[0])
                            }
                          >
                            Open
                          </button>
                        ) : n.post_id ? (
                          <Link
                            to="/p/$postId"
                            params={{ postId: n.post_id }}
                            className="text-xs text-primary hover:underline"
                          >
                            View
                          </Link>
                        ) : n.type === "friend_request" || n.type === "friend_accept" ? (
                          <Link to="/friends" className="text-xs text-primary hover:underline">
                            Open
                          </Link>
                        ) : trackedEventName(n) ? (
                          <Link to="/tracker" className="text-xs text-primary hover:underline">
                            Open tracker
                          </Link>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
