import { CalendarDays, Users2, Megaphone } from "lucide-react";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { clubDraft, crewDraft, eventDraft } from "@/lib/share-to-feed";
import type { CommunityClub, CommunityOutreachEvent } from "@/lib/community.functions";

/**
 * One-click sharing for the Community overview.
 * Only renders the shortcuts we have real data for, so nothing is a dead end.
 */
export function CommunityQuickShare({
  friendCount,
  myClub,
  nextEvent,
}: {
  friendCount: number;
  /** A club the viewer belongs to, when we have one to post an update for. */
  myClub?: CommunityClub | null;
  /** The next outreach event the viewer is hosting or attending. */
  nextEvent?: CommunityOutreachEvent | null;
}) {
  const hasAny = friendCount >= 0;
  if (!hasAny) return null;

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Share with the community
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {myClub ? (
          <ShareToFeedButton
            draft={() =>
              clubDraft({
                kind: "update",
                clubId: myClub.id,
                clubName: myClub.name,
                location: myClub.location,
                memberCount: myClub.member_count,
              })
            }
            label="Post a club update"
            size="sm"
            variant="outline"
            leadingIcon={<Megaphone className="h-3.5 w-3.5" />}
          />
        ) : null}

        {nextEvent ? (
          <ShareToFeedButton
            draft={() =>
              eventDraft({
                id: nextEvent.id,
                title: nextEvent.title,
                kind: nextEvent.kind,
                starts_at: nextEvent.starts_at,
                location: nextEvent.location,
              })
            }
            label="Share an outreach event"
            size="sm"
            variant="outline"
            leadingIcon={<CalendarDays className="h-3.5 w-3.5" />}
          />
        ) : null}

        <ShareToFeedButton
          draft={() => crewDraft({ friendCount })}
          label="Invite friends"
          size="sm"
          variant="outline"
          leadingIcon={<Users2 className="h-3.5 w-3.5" />}
        />
      </div>
    </section>
  );
}
