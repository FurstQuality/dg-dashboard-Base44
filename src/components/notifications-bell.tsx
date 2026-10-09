import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AtSign,
  Bell,
  Calendar,
  Heart,
  MessageCircle,
  TriangleAlert,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials, timeAgo, useSession } from "@/lib/current-user";
import {
  markAllNotificationsRead,
  notificationsQueryOptions,
  type NotificationRow,
} from "@/lib/entities/notifications";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  like: Heart,
  comment: MessageCircle,
  mention: AtSign,
  friend_request: UserPlus,
  friend_accept: UserCheck,
  group: Users,
  achievement: Trophy,
  event: Calendar,
  score_change: TriangleAlert,
};

const TEXT: Record<string, string> = {
  like: "reacted to your post",
  comment: "commented on your post",
  mention: "mentioned you",
  friend_request: "sent you a friend request",
  friend_accept: "accepted your friend request",
  group: "posted in your club",
  achievement: "unlocked an achievement",
  event: "has an event update for you",
  score_change: "changed a confirmed score on your card",
};

function payloadString(n: NotificationRow, key: string): string {
  const data = n.data ?? null;
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/** Where a notification should take the reader, if anywhere. */
function targetFor(n: NotificationRow): string | null {
  const link = payloadString(n, "link");
  if (link) return link;
  if (n.post_id) return `/p/${n.post_id}`;
  if (n.type === "friend_request" || n.type === "friend_accept") return "/friends";
  if (payloadString(n, "event_name")) return "/tracker";
  return null;
}

function lineFor(n: NotificationRow): { title: string; body: string } {
  const title = payloadString(n, "title");
  if (title) return { title, body: payloadString(n, "body") };
  const who = n.actor?.display_name ?? n.actor?.username ?? "Someone";
  return { title: who, body: TEXT[n.type] ?? "sent you an update" };
}

/**
 * NotificationsBell — header bell with an inline dropdown panel. Reading
 * notifications no longer requires a full-page navigation; the panel shows the
 * most recent items and links out to the full history.
 */
export function NotificationsBell({ unread }: { unread: number }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({
    ...notificationsQueryOptions(user?.id, 12),
    enabled: Boolean(user?.id) && open,
  });

  async function markRead() {
    if (!user?.id || unread === 0) return;
    await markAllNotificationsRead(user.id);
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className={
            "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors " +
            (open
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground")
          }
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-[24rem]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="text-sm font-semibold">Notifications</div>
          <button
            type="button"
            onClick={() => void markRead()}
            disabled={unread === 0}
            className="text-xs text-primary hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline"
          >
            Mark all read
          </button>
        </div>

        <div className="max-h-[24rem] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing new yet — reactions, comments, and event updates land here.
            </div>
          ) : (
            items.map((n) => {
              const Icon = ICON[n.type] ?? Bell;
              const line = lineFor(n);
              const target = targetFor(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void markRead();
                    if (target)
                      navigate({ to: target } as unknown as Parameters<typeof navigate>[0]);
                  }}
                  className={
                    "flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 transition-colors hover:bg-muted/60 " +
                    (n.read_at ? "" : "bg-primary/5")
                  }
                >
                  <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                    {n.actor?.avatar_url ? <AvatarImage src={n.actor.avatar_url} /> : null}
                    <AvatarFallback>
                      {initials(n.actor?.display_name ?? undefined)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-semibold">{line.title}</div>
                    <div className="line-clamp-2 text-muted-foreground">{line.body}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-3 py-2">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-sm text-primary hover:underline"
          >
            See all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
