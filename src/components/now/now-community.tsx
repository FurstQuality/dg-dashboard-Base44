import { Link } from "@tanstack/react-router";
import { MessageCircle, UserPlus } from "lucide-react";
import { useCommunityBadges } from "@/components/community/use-community-badges";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { plural } from "@/components/now/now-data";

/** Community, right now: who is waiting on you. */
export function NowCommunity() {
  const { unreadMessages, friendRequests } = useCommunityBadges();

  return (
    <NowStrip
      items={[
        friendRequests > 0 ? (
          <Link key="requests" to="/friends" className={nowTileLinkClass}>
            <NowTile
              icon={UserPlus}
              tone="attention"
              eyebrow="Waiting on you"
              title={`${plural(friendRequests, "friend request")}`}
              detail="Accept or decline"
            />
          </Link>
        ) : null,
        unreadMessages > 0 ? (
          <Link key="chats" to="/dgim" className={nowTileLinkClass}>
            <NowTile
              icon={MessageCircle}
              tone="live"
              eyebrow="Unread"
              title={`${plural(unreadMessages, "new message")}`}
              detail="Open DGIM"
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
