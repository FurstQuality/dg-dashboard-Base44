import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MessageCircle, UserPlus } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { useCommunityBadges } from "@/components/community/use-community-badges";
import { scheduleQueryOptions } from "@/lib/entities";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { plural, whenLabel } from "@/components/now/now-data";

/** Feed, right now: who's waiting on you, and what's on your calendar next. */
export function NowFeed() {
  const { user } = useSession();
  const { unreadMessages, friendRequests } = useCommunityBadges();
  const { data: schedule } = useQuery(scheduleQueryOptions(user?.id, { limit: 1 }));
  const next = schedule?.[0] ?? null;

  return (
    <NowStrip
      items={[
        unreadMessages > 0 ? (
          <Link key="chats" to="/dgim" className={nowTileLinkClass}>
            <NowTile
              icon={MessageCircle}
              tone="live"
              eyebrow="Unread"
              title={plural(unreadMessages, "new message")}
              detail="Open DGIM"
            />
          </Link>
        ) : null,
        friendRequests > 0 ? (
          <Link key="requests" to="/friends" className={nowTileLinkClass}>
            <NowTile
              icon={UserPlus}
              tone="attention"
              eyebrow="Waiting on you"
              title={plural(friendRequests, "friend request")}
              detail="Accept or decline"
            />
          </Link>
        ) : null,
        next ? (
          <Link key="next" to="/schedule" className={nowTileLinkClass}>
            <NowTile
              icon={CalendarDays}
              eyebrow={`Up next · ${whenLabel(next.starts_on)}`}
              title={next.title}
              detail={
                [next.city, next.state].filter(Boolean).join(", ") ||
                next.location ||
                "On your schedule"
              }
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
