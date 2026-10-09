import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  ExternalLink,
  Flag,
  MapPin,
  RefreshCw,
  Ruler,
  ShieldQuestion,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrackCourseButton } from "@/components/tracker/track-course-button";
import {
  getCourseFacts,
  pullVerifiedCourseRating,
  type CourseFacts,
} from "@/lib/course-verified.functions";

type Props = {
  roundNumber: number | null;
  courseId: string | null;
  courseName: string;
  layoutName: string | null;
  /** PDGA event refs for the event this course belongs to, when it has one. */
  eventRefs?: string[];
};

/**
 * The default view of a course on your schedule: the same facts the course
 * directory carries, plus the course's verified PDGA scoring rating when we
 * have one. Every number here comes from stored course data or real PDGA
 * tournament rounds — never an estimate.
 */
export function EventCourseCard({
  roundNumber,
  courseId,
  courseName,
  layoutName,
  eventRefs,
}: Props) {
  const load = useServerFn(getCourseFacts);
  const pull = useServerFn(pullVerifiedCourseRating);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["course-facts", courseId ?? courseName],
    queryFn: () => load({ data: { courseId, courseName, eventRefs } }),
    staleTime: 5 * 60_000,
  });

  const pullMutation = useMutation({
    mutationFn: () => pull({ data: { courseId, courseName, eventRefs } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.message(res.message);
      void qc.invalidateQueries({ queryKey: ["course-facts", courseId ?? courseName] });
      void qc.invalidateQueries({ queryKey: ["course-fit"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "We couldn't reach PDGA just now."),
  });

  const facts: CourseFacts | undefined = data;
  const verified = facts?.verified ?? null;
  const place = [facts?.city, facts?.state].filter(Boolean).join(", ");

  return (
    <Card className="min-w-0 space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {roundNumber != null ? <Badge variant="secondary">Round {roundNumber}</Badge> : null}
            <h3 className="truncate text-base font-semibold">{facts?.name ?? courseName}</h3>
            {layoutName || facts?.layoutName ? (
              <Badge variant="outline">{layoutName ?? facts?.layoutName}</Badge>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {place ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {place}
              </span>
            ) : null}
            {facts?.holeCount ? (
              <span className="flex items-center gap-1">
                <Flag className="h-3.5 w-3.5" />
                {facts.holeCount} holes
                {facts.parTotal ? ` · par ${facts.parTotal}` : ""}
              </span>
            ) : null}
            {facts?.distanceTotal ? (
              <span className="flex items-center gap-1">
                <Ruler className="h-3.5 w-3.5" />
                {facts.distanceTotal.toLocaleString()} ft
              </span>
            ) : null}
            {facts?.designer ? <span>Designed by {facts.designer}</span> : null}
            {facts?.yearEstablished ? <span>Est. {facts.yearEstablished}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <TrackCourseButton courseId={courseId} courseName={courseName} location={null} />
          {courseId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/courses/$courseId" params={{ courseId }}>
                Open course
              </Link>
            </Button>
          ) : null}
          {facts?.pdgaUrl ? (
            <Button asChild size="sm" variant="ghost">
              <a href={facts.pdgaUrl} target="_blank" rel="noreferrer">
                PDGA listing <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Reading this course's data…</div>
      ) : verified && verified.ssa != null ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <BadgeCheck className="h-4 w-4 text-emerald-500" />
            Verified from PDGA rounds
            <Badge variant={verified.status === "approved" ? "secondary" : "outline"}>
              {verified.status === "approved" ? "Confirmed" : "Awaiting review"}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Scratch score (SSA)" value={verified.ssa.toFixed(1)} />
            <Stat
              label="Stroke value"
              value={verified.strokeValue != null ? `${verified.strokeValue} pts` : "—"}
            />
            <Stat label="Rated rounds used" value={verified.sampleSize.toLocaleString()} />
            <Stat label="PDGA events" value={String(verified.eventRefs.length)} />
          </div>
          {verified.rounds.length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {verified.rounds.slice(0, 4).map((r, i) => (
                <li key={`${r.eventRef}-${r.round}-${i}`} className="truncate">
                  {r.eventName ?? `Event ${r.eventRef}`} · R{r.round}
                  {r.winningScore != null ? ` · winning ${r.winningScore}` : ""}
                  {r.medianScore != null ? ` · field median ${r.medianScore}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {verified.pdgaCourseUrl ? (
            <a
              href={verified.pdgaCourseUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {verified.pdgaCourseName ?? "PDGA course page"}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-start gap-2 text-sm">
            <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">No verified course rating yet</div>
              <p className="text-xs text-muted-foreground">
                Pull the PDGA tournament rounds played here to set this course's scratch score and
                stroke value. Everything below then uses real numbers instead of guesses.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${pullMutation.isPending ? "animate-spin" : ""}`} />
            {pullMutation.isPending ? "Reading PDGA…" : "Pull verified PDGA rounds"}
          </Button>
        </div>
      )}

      {facts?.history && facts.history.pdgaRounds > 0 ? (
        <div className="rounded-lg border border-border p-3">
          <div className="text-sm font-medium">PDGA-rated rounds on file here</div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rated rounds" value={facts.history.pdgaRounds.toLocaleString()} />
            <Stat
              label="Average round rating"
              value={
                facts.history.avgRoundRating != null
                  ? Math.round(facts.history.avgRoundRating).toString()
                  : "—"
              }
            />
            <Stat
              label="Average score"
              value={facts.history.avgScore != null ? facts.history.avgScore.toFixed(1) : "—"}
            />
            <Stat
              label="Last played"
              value={
                facts.history.lastPlayedOn
                  ? new Date(facts.history.lastPlayedOn).toLocaleDateString()
                  : "—"
              }
            />
          </div>
        </div>
      ) : null}

      {facts && facts.holesOnFile > 0 ? (
        <p className="text-xs text-muted-foreground">
          {facts.holesWithDistance} of {facts.holesOnFile} holes have measured distances on file.
        </p>
      ) : facts ? (
        <p className="text-xs text-muted-foreground">
          No hole-by-hole detail on file for this course yet.
        </p>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
