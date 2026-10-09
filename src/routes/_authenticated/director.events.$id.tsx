import { EventCancelActions } from "@/components/director/event-cancel-actions";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardList,
  DollarSign,
  ExternalLink,
  Megaphone,
  Printer,
  Settings2,
  Shield,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { EventDayPanel } from "@/components/director/event-day-panel";
import { EventAlertsManager } from "@/components/events/event-alerts";
import { VolunteerTasksManager } from "@/components/events/volunteer-tasks";
import { EventFinancePanel } from "@/components/director/event-finance-panel";
import { AdditionalPrizesPanel } from "@/components/director/additional-prizes-panel";
import { PageHeader, ContentCard, LoadingSkeleton } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/current-user";
import { getDirectorChecklist, getDirectorEvents, getDirectorCockpit } from "@/lib/director.functions";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";
import { buildDirectorList, STAGE_LABEL } from "@/lib/director-event-list";

export const Route = createFileRoute("/_authenticated/director/events/$id")({
  head: () => ({
    meta: [
      { title: "Event workspace · DG Dashboard" },
      {
        name: "description",
        content: "Everything one event needs — players, team, operations, money and results.",
      },
      { property: "og:title", content: "Event workspace — DG Dashboard" },
      {
        property: "og:description",
        content: "Run one event from a single place, from setup to results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventWorkspace,
});

/** Workspace follows the event's life: plan it, gather people, run it, close it. */
type Section = "overview" | "plan" | "people" | "run" | "close";
const SECTIONS: { value: Section; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "plan", label: "Plan" },
  { value: "people", label: "People" },
  { value: "run", label: "Run" },
  { value: "close", label: "Close" },
];

function chicagoToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

function ToolRow({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Users;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-[13px] text-muted-foreground">{body}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EventWorkspace() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const fetchEvents = useServerFn(getDirectorEvents);
  const fetchChecklist = useServerFn(getDirectorChecklist);
  const [section, setSection] = useState<Section>("overview");

  const eventsQ = useQuery({
    queryKey: directorKeys.events(userId),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchEvents(),
  });
  const fetchCockpit = useServerFn(getDirectorCockpit);
  const cockpitQ = useQuery({
    queryKey: directorKeys.cockpit(userId),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchCockpit(),
  });
  const item = useMemo(
    () => buildDirectorList(eventsQ.data ?? [], [], chicagoToday()).find((e) => e.id === id),
    [eventsQ.data, id],
  );
  const checklistQ = useQuery({
    queryKey: directorKeys.checklist(id),
    enabled: !!item,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchChecklist({ data: { tournamentId: id } }),
  });

  if (eventsQ.isPending) return <LoadingSkeleton variant="list" />;
  if (!item)
    return (
      <ContentCard title="We couldn't open this event">
        <p className="text-sm text-muted-foreground">
          It may have been removed, or you aren't a director on it.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to="/director/tournaments">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to your events
          </Link>
        </Button>
      </ContentCard>
    );

  const raw = (cockpitQ.data?.events ?? []).find((e) => e.id === id);
  const checklist = checklistQ.data ?? [];
  const done = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost" className="-ml-2">
        <Link to="/director/tournaments">
          <ArrowLeft className="mr-1 h-4 w-4" /> Your events
        </Link>
      </Button>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event workspace
          </span>
        }
        title={item.name}
        description={`${STAGE_LABEL[item.stage]} · ${item.role === "owner" ? "You host" : "Co-director"}. Next: ${item.next.label.toLowerCase()}.`}
        primaryAction={
          <Button asChild size="sm" variant="outline">
            <Link to="/tournaments/$slug" params={{ slug: item.slug }}>
              Public page <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        }
        secondaryAction={
          item.role === "owner" ? (
            <EventCancelActions
              kind="tournament"
              id={item.id}
              name={item.name}
              cancelled={item.stage === "cancelled"}
              onChanged={() => void eventsQ.refetch()}
            />
          ) : undefined
        }
      />

      <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Workspace sections">
        {SECTIONS.map((s) => (
          <Button
            key={s.value}
            role="tab"
            aria-selected={section === s.value}
            size="sm"
            variant={section === s.value ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setSection(s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {section === "overview" && raw ? (
        <EventDayPanel
          event={{
            id: raw.id,
            slug: raw.slug,
            name: raw.name,
            isLiveToday: raw.isLiveToday,
            daysOut: raw.daysOut,
            registrations: raw.registrations,
          }}
          onOpenFinance={() => setSection("close")}
        />
      ) : null}

      {section === "overview" && (
        <ContentCard
          title="Readiness"
          subtitle={
            checklist.length
              ? `${done} of ${checklist.length} prep tasks done`
              : "No prep tasks yet — add them under Team & operations."
          }
        >
          {checklist.length > 0 && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  {c.done ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={c.done ? "text-muted-foreground line-through" : ""}>
                    {c.label}
                  </span>
                  <Badge variant="outline" className="ml-auto">
                    {c.phase}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </ContentCard>
      )}

      {section === "plan" && (
        <>
          <ContentCard title="Event setup" subtitle="Details, series, course & rounds, registration, format, schedule and the public page.">
            <ToolRow icon={Settings2} title="Edit event setup" body="Everything players see before they sign up.">
              <Button asChild size="sm">
                <Link to="/tournaments/$slug" params={{ slug: item.slug }} search={{ tab: "manage" }}>
                  Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </ToolRow>
          </ContentCard>
          <ContentCard title="Promotion" subtitle="Share links, QR codes and posts to fill the field.">
            <ToolRow icon={Megaphone} title="Share & promote" body="Links, QR and ready-made posts.">
              <Button asChild size="sm" variant="outline">
                <Link to="/tournaments/$slug" params={{ slug: item.slug }} search={{ tab: "share" }}>
                  Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </ToolRow>
          </ContentCard>
        </>
      )}

      {section === "people" && (
        <>
          <ContentCard title="Players" subtitle="Sign-ups, payments, waitlist and check-in.">
            <div className="space-y-2">
              <ToolRow icon={Users} title="Registrations" body="Approve, move divisions, mark paid, manage the waitlist.">
                <Button asChild size="sm">
                  <Link to="/director/registrations" search={{ event: item.id }}>
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </ToolRow>
              <ToolRow icon={UserCheck} title="Check-in" body="Check players in at the course, including walk-ups.">
                <Button asChild size="sm" variant="outline">
                  <Link to="/director/check-in" search={{ kind: "tournament", id: item.id }}>
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </ToolRow>
            </div>
          </ContentCard>
          <ContentCard title="Team" subtitle="Co-directors, staff roles and volunteers.">
            <ToolRow icon={Shield} title="Event team" body="Who's helping and what they can do.">
              <Button asChild size="sm" variant="outline">
                <Link to="/director/ops" search={{ event: item.id }}>
                  Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </ToolRow>
          </ContentCard>
        </>
      )}

      {section === "run" && (
        <>
          <ContentCard title="Operations" subtitle="Prep tasks and printed materials for the day.">
            <div className="space-y-2">
              <ToolRow icon={ClipboardList} title="Tasks & day-of" body="Prep checklist and event-day tools.">
                <Button asChild size="sm">
                  <Link to="/director/ops" search={{ event: item.id }}>
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </ToolRow>
              <ToolRow icon={Printer} title="Event kit" body="Scorecards, hole assignments and signs to print.">
                <Button asChild size="sm" variant="outline">
                  <Link to="/director/kit" search={{ event: item.id }}>
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </ToolRow>
            </div>
          </ContentCard>
          <ContentCard title="Scoring" subtitle="Live scores as cards come in.">
            <ToolRow icon={Trophy} title="Live leaderboard" body="What players and spectators see.">
              <Button asChild size="sm">
                <Link to="/tournaments/$slug" params={{ slug: item.slug }} search={{ tab: "leaderboard" }}>
                  Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </ToolRow>
          </ContentCard>
          <ContentCard title="Player updates" subtitle="Announcements, delays and course issues show up on players' phones right away.">
            <EventAlertsManager tournamentId={item.id} />
          </ContentCard>
          <ContentCard title="Volunteer jobs" subtitle="Assign jobs to your team. Volunteers see them on their phone.">
            <VolunteerTasksManager tournamentId={item.id} />
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link to="/volunteer/$slug" params={{ slug: item.slug }}>
                Open volunteer phone view <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </ContentCard>
        </>
      )}

      {section === "close" && (
        <>
          <ContentCard title="Finance" subtitle="Payouts per division, locked once final.">
            <EventFinancePanel eventId={item.id} />
            <ToolRow icon={DollarSign} title="Payout calculator" body="Try payouts for any turnout.">
              <Button asChild size="sm" variant="outline">
                <Link to="/director/payouts">
                  Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </ToolRow>
          </ContentCard>
          <ContentCard title="Additional payouts & prizes" subtitle="Ace Fund, 50/50, CTPs and sponsor prizes — separate from placement payouts.">
            <AdditionalPrizesPanel kind="tournament" eventId={item.id} />
          </ContentCard>
          <ContentCard title="Results" subtitle="Final standings on the public event page.">
            <ToolRow icon={Trophy} title="Final results" body="Review and share standings.">
              <Button asChild size="sm">
                <Link to="/tournaments/$slug" params={{ slug: item.slug }} search={{ tab: "leaderboard" }}>
                  Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </ToolRow>
          </ContentCard>
        </>
      )}
    </div>
  );
}
