import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, MapPin, Play, ShieldQuestion } from "lucide-react";

import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewNeededPanel } from "@/components/import/review-needed-panel";
import { UnfinishedSetups } from "@/components/event-setup/unfinished-setups";
import { listPendingData } from "@/lib/data-review.functions";

export const Route = createFileRoute("/_authenticated/data-review")({
  head: () => ({
    meta: [
      { title: "Data review · DG Dashboard" },
      {
        name: "description",
        content:
          "Everything in your DG Dashboard account that is unfinished, unverified, or waiting on a reviewer — rounds, courses, submissions, and event setups.",
      },
      { property: "og:title", content: "Data review · DG Dashboard" },
      {
        property: "og:description",
        content: "Clear out unfinished rounds, unverified scores, and pending course submissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataReviewPage,
});

function DataReviewPage() {
  const q = useQuery({
    queryKey: ["data-review", "pending"],
    queryFn: () => listPendingData(),
    staleTime: 30_000,
  });
  const d = q.data;

  const counts = [
    { label: "Rounds in progress", value: d?.unfinishedRounds.length ?? 0, icon: Play },
    { label: "Scores not verified", value: d?.unverifiedRounds.length ?? 0, icon: ShieldQuestion },
    { label: "Placeholder courses", value: d?.placeholderCourses.length ?? 0, icon: MapPin },
    {
      label: "Waiting on a reviewer",
      value: (d?.pendingCourses.length ?? 0) + (d?.submissions.length ?? 0),
      icon: ClipboardCheck,
    },
  ];
  const totalOpen = counts.reduce((n, c) => n + c.value, 0);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Data quality"
        title="Data review"
        description="Anything of yours that isn't finished, isn't verified, or is still pending review — in one queue you can clear."
        secondaryAction={
          <Button variant="outline" asChild>
            <Link to="/settings/imports">Import &amp; sync</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </div>
            <div className="mt-1 font-display text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      {!q.isLoading && totalOpen === 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Your data is clean</CardTitle>
              <CardDescription className="mt-1">
                No unfinished rounds, unverified scores, or pending submissions right now. Anything
                new will show up here.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Imported rounds missing a score or rating — handles its own empty state. */}
      <ReviewNeededPanel />

      {(d?.unfinishedRounds.length ?? 0) > 0 && (
        <Section
          title="Rounds still in progress"
          description="Finish or delete these so they count in your stats."
          count={d!.unfinishedRounds.length}
        >
          {d!.unfinishedRounds.map((r) => (
            <Row
              key={r.id}
              title={r.course_name}
              meta={`Started ${formatDay(r.started_at)}`}
              badge="In progress"
              action={
                <Button size="sm" asChild>
                  <Link to="/play/$roundId" params={{ roundId: r.id }}>
                    Resume
                  </Link>
                </Button>
              }
            />
          ))}
        </Section>
      )}

      {(d?.unverifiedRounds.length ?? 0) > 0 && (
        <Section
          title="Scores not verified"
          description="A second scorekeeper hasn't confirmed these cards, so they can't earn a DGD rating."
          count={d!.unverifiedRounds.length}
        >
          {d!.unverifiedRounds.map((r) => (
            <Row
              key={r.id}
              title={r.course_name}
              meta={`Played ${formatDay(r.started_at)}`}
              badge="Unverified"
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link to="/play/$roundId" params={{ roundId: r.id }}>
                    Open card
                  </Link>
                </Button>
              }
            />
          ))}
        </Section>
      )}

      {(d?.placeholderCourses.length ?? 0) > 0 && (
        <Section
          title="Placeholder courses"
          description="Name-only courses you added for an event. Add holes and measurements to make them scorable and public."
          count={d!.placeholderCourses.length}
        >
          {d!.placeholderCourses.map((c) => (
            <Row
              key={c.id}
              title={c.name}
              meta={[c.city, c.state].filter(Boolean).join(", ") || `${c.hole_count} holes`}
              badge="Placeholder"
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link to="/courses/$courseId/edit" params={{ courseId: c.id }}>
                    Build it out
                  </Link>
                </Button>
              }
            />
          ))}
        </Section>
      )}

      {(d?.pendingCourses.length ?? 0) > 0 && (
        <Section
          title="Courses awaiting approval"
          description="Submitted to the directory and waiting on a moderator."
          count={d!.pendingCourses.length}
        >
          {d!.pendingCourses.map((c) => (
            <Row
              key={c.id}
              title={c.name}
              meta={[c.city, c.state].filter(Boolean).join(", ") || `${c.hole_count} holes`}
              badge="Pending"
            />
          ))}
        </Section>
      )}

      {(d?.submissions.length ?? 0) > 0 && (
        <Section
          title="Submissions in review"
          description="Course edits and rating profiles you sent in. No action needed until a moderator responds."
          count={d!.submissions.length}
        >
          {d!.submissions.map((s) => (
            <Row key={s.id} title={s.label} meta={`Sent ${formatDay(s.created_at)}`} badge="Pending" />
          ))}
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <UnfinishedSetups kind="tournament" />
        <UnfinishedSetups kind="league" />
      </div>
    </PageShell>
  );
}

function Section({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="rounded-lg bg-amber-500/15 p-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {count}
            </Badge>
          </div>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
    </Card>
  );
}

function Row({
  title,
  meta,
  badge,
  action,
}: {
  title: string;
  meta: string;
  badge: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase">
          {badge}
        </Badge>
        {action}
      </div>
    </div>
  );
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
