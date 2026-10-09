import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  ClipboardCheck,
  DollarSign,
  MessageSquare,
  Star,
  TriangleAlert,
  Trophy,
  Users,
} from "lucide-react";
import { ContentCard, LoadingSkeleton } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DirectorErrorState } from "@/components/director/director-error-state";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { organizerDraft } from "@/lib/share-to-feed";
import { money } from "@/lib/director-kit";
import { getDirectorPortfolio, type PortfolioEvent } from "@/lib/director-portfolio.functions";
import { DIRECTOR_STALE } from "@/lib/director-queries";

const dayLabel = (d: string | null) =>
  d
    ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not set";

const REPORT_LABEL: Record<string, string> = {
  fallen_tree: "Fallen tree",
  hazard: "Hazard",
  flooding: "Flooding",
  construction: "Construction",
  closed: "Course closed",
  basket_missing: "Basket missing",
  basket_moved: "Basket moved",
  tee_damage: "Tee pad damage",
  obstacle: "Obstacle",
  signage: "Signage",
  other: "Other",
};

function pct(done: number, total: number) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-border/60 bg-card/60 px-4 py-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="text-[13px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function EventLink({ event, children }: { event: PortfolioEvent; children: React.ReactNode }) {
  return event.kind === "tournament" ? (
    <Link to="/tournaments/$slug" params={{ slug: event.slug }} className="hover:underline">
      {children}
    </Link>
  ) : (
    <Link to="/director/leagues/$slug" params={{ slug: event.slug }} className="hover:underline">
      {children}
    </Link>
  );
}

function EventRow({ event }: { event: PortfolioEvent }) {
  const fill = event.capacity ? pct(event.signups, event.capacity) : null;
  return (
    <li className="rounded-control border border-border/60 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            <EventLink event={event}>{event.name}</EventLink>
          </div>
          <div className="text-[12px] text-muted-foreground">
            {event.kind === "league" ? "League" : "Tournament"} · {dayLabel(event.startDate)}
            {event.courseName ? ` · ${event.courseName}` : ""}
            {event.dates
              ? ` · ${event.dates} ${event.kind === "league" ? "nights" : "rounds"}`
              : ""}
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-sm font-semibold tabular-nums">{event.signups}</div>
            <div className="text-[12px] text-muted-foreground">
              {event.capacity ? `of ${event.capacity} signed up` : "signed up"}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold tabular-nums">
              {event.prepTotal ? `${pct(event.prepDone, event.prepTotal)}%` : "—"}
            </div>
            <div className="text-[12px] text-muted-foreground">prep done</div>
          </div>
        </div>
      </div>
      {fill !== null ? <Progress className="mt-2" value={fill} /> : null}
    </li>
  );
}

/**
 * Portfolio overview for everything an organizer runs: sign-ups, money, prep
 * progress, recaps worth sharing, and what players are saying about the venues.
 */
export function DirectorPortfolio({ userId }: { userId: string | null | undefined }) {
  const fetchPortfolio = useServerFn(getDirectorPortfolio);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["director-portfolio", userId],
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchPortfolio(),
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="stat-grid" count={4} />
        <LoadingSkeleton variant="card" count={2} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <DirectorErrorState title="Your event overview didn't load" onRetry={() => void refetch()} />
    );
  }

  const t = data.totals;

  if (t.events === 0) {
    return (
      <ContentCard
        title="Your event overview"
        subtitle="Once you run a tournament or league, sign-ups, money, prep progress, and player feedback all land here."
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/director/tournaments/new">Create a tournament</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/director/leagues/new">Start a league</Link>
          </Button>
        </div>
      </ContentCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={CalendarRange}
          label="Events you run"
          value={String(t.events)}
          hint={`${t.tournaments} tournament${t.tournaments === 1 ? "" : "s"} · ${t.leagues} league${
            t.leagues === 1 ? "" : "s"
          } · ${t.upcoming} coming up`}
        />
        <Stat
          icon={Users}
          label="Players signed up"
          value={String(t.signups)}
          hint={`${t.signupsLast30} in the last 30 days · ${t.checkedIn} checked in`}
        />
        <Stat
          icon={DollarSign}
          label="Entry fees collected"
          value={money(t.feesCollectedCents)}
          hint={`${money(t.feesOutstandingCents)} still owed`}
        />
        <Stat
          icon={ClipboardCheck}
          label="Prep complete"
          value={t.prepTotal ? `${pct(t.prepDone, t.prepTotal)}%` : "No checklists yet"}
          hint={t.prepTotal ? `${t.prepDone} of ${t.prepTotal} tasks done` : "Add a prep checklist"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ContentCard
          title="Coming up"
          subtitle={
            data.upcoming.length
              ? "Sign-ups and prep progress for every event still ahead of you."
              : "Nothing on the calendar yet."
          }
        >
          {data.upcoming.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/director/tournaments/new">Create a tournament</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/director/leagues/new">Start a league</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.upcoming.map((e) => (
                <EventRow key={`${e.kind}-${e.id}`} event={e} />
              ))}
            </ul>
          )}
        </ContentCard>

        <ContentCard
          title="Recaps"
          subtitle={
            data.recaps.length
              ? "Wrapped events — post the results while people still care."
              : "Your finished events will show up here to recap."
          }
        >
          {data.recaps.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nothing has wrapped yet. After an event finishes you can share the field size and
              results straight to the feed.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.recaps.map((e) => (
                <li
                  key={`${e.kind}-${e.id}`}
                  className="flex items-start justify-between gap-3 rounded-control border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      <EventLink event={e}>{e.name}</EventLink>
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {dayLabel(e.startDate)} · {e.signups} played · {money(e.feesCollectedCents)}{" "}
                      collected
                    </div>
                  </div>
                  <ShareToFeedButton
                    iconOnly
                    label="Share recap"
                    draft={() =>
                      organizerDraft({
                        kind: e.kind === "league" ? "league_night" : "final_results",
                        eventName: e.name,
                        startDate: e.startDate,
                        courseName: e.courseName,
                        players: e.signups,
                        slug: e.slug,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </ContentCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ContentCard
          title="What players say about your venues"
          subtitle="Recent course reviews from the players who show up to your events."
        >
          {data.reviews.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              No reviews yet for the courses you host on. Ask your field to leave one after the next
              round.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.reviews.map((r) => (
                <li key={r.id} className="rounded-control border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{r.courseName}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
                      <Star className="h-3.5 w-3.5 text-competitive-gold" />
                      {r.rating}
                    </span>
                  </div>
                  {r.body ? (
                    <p className="mt-1 line-clamp-3 text-[13px] text-muted-foreground">{r.body}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </ContentCard>

        <ContentCard
          title="Course conditions to fix before you host"
          subtitle="Open reports players filed at your event courses."
        >
          {data.issues.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Trophy className="h-4 w-4 text-community-green" />
              No open condition reports at your venues. Good shape for the next event.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.issues.map((i) => (
                <li key={i.id} className="rounded-control border border-border/60 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TriangleAlert className="h-4 w-4 text-warning" />
                    <span className="text-sm font-semibold">
                      {REPORT_LABEL[i.kind] ?? i.kind.replace(/_/g, " ")}
                    </span>
                    <Badge variant="outline" className="text-[11px]">
                      {i.status === "confirmed" ? "Confirmed" : "Reported"}
                    </Badge>
                    <span className="text-[12px] text-muted-foreground">{i.courseName}</span>
                  </div>
                  {i.description ? (
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                      {i.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </ContentCard>
      </div>
    </div>
  );
}
