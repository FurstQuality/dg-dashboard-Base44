import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Star,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getEventPreview } from "@/lib/tracker-preview.functions";
import { syncPdgaEventField } from "@/lib/pdga-field.functions";
import { trackEventByPdgaRef, untrackEvent } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { eventOddsDraft, trackingDraft } from "@/lib/share-to-feed";

const dateFmt = (d: string | null) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

function Range({ start, end }: { start: string | null; end: string | null }) {
  if (!start) return <>Dates not published yet</>;
  const s = dateFmt(start);
  const e = end && end !== start ? dateFmt(end) : null;
  return <>{e ? `${s} – ${e}` : s}</>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
      {icon}
      {children}
    </h3>
  );
}

/**
 * Full event preview — field, field strength, courses and tee times, the
 * caller's odds, friends registered, and live standings — openable without
 * saving the event first.
 */
export function EventPreviewSheet({
  eventRef,
  fallbackName,
  onOpenChange,
}: {
  eventRef: string | null;
  fallbackName?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = useServerFn(getEventPreview);
  const pullField = useServerFn(syncPdgaEventField);
  const track = useServerFn(trackEventByPdgaRef);
  const untrack = useServerFn(untrackEvent);
  const queryClient = useQueryClient();
  const [division, setDivision] = useState<string | null>(null);

  const query = useQuery({
    queryKey: trackerKeys.preview(eventRef ?? "", division),
    queryFn: () => preview({ data: { eventRef: eventRef!, division } }),
    enabled: !!eventRef,
    staleTime: TRACKER_STALE.preview,
  });
  const data = query.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tracker", "preview", eventRef ?? ""] });
    void queryClient.invalidateQueries({ queryKey: trackerKeys.watchlist() });
  };

  const fieldSync = useMutation({
    mutationFn: () => pullField({ data: { eventRef: eventRef! } }),
    onSuccess: (res) => {
      toast.success(res.message);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trackMutation = useMutation({
    mutationFn: () =>
      track({
        data: {
          pdga_event_ref: eventRef!,
          name: (data?.name ?? fallbackName ?? `PDGA event #${eventRef}`).slice(0, 200),
          event_date: data?.startDate ?? null,
          location: data?.location ?? null,
          tier: data?.tier ?? null,
          url: data?.pdgaUrl ?? null,
        },
      }),
    onSuccess: (res) => {
      toast[res.created ? "success" : "info"](
        res.created ? "Added to your tracker" : "Already in your tracker",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const untrackMutation = useMutation({
    mutationFn: () => untrack({ data: { event_id: data!.trackedEventId! } }),
    onSuccess: () => {
      toast.success("Removed from your tracker");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const title = data?.name ?? fallbackName ?? (eventRef ? `PDGA event #${eventRef}` : "Event");

  return (
    <Sheet open={!!eventRef} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-8">
          <SheetTitle className="text-left text-base leading-snug">{title}</SheetTitle>
          <SheetDescription className="text-left">
            Everything PDGA has published for this event. Nothing here is estimated — unknown values
            stay labelled.
          </SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading event details…</p>
        ) : query.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            Couldn't load this event: {(query.error as Error).message}
          </p>
        ) : !data ? null : (
          <div className="mt-4 space-y-5 pb-8">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {data.tier ? (
                <Badge variant="secondary" className="text-[10px]">
                  {data.tier}
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />{" "}
                <Range start={data.startDate} end={data.endDate} />
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {data.location ?? "Location not published"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {data.tracked ? (
                <>
                  {data.trackedGroupId && data.trackedEventId ? (
                    <Button asChild size="sm">
                      <Link
                        to="/tracker/$groupId/event/$eventId"
                        params={{ groupId: data.trackedGroupId, eventId: data.trackedEventId }}
                      >
                        Open full event
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={untrackMutation.isPending}
                    onClick={() => untrackMutation.mutate()}
                  >
                    {untrackMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Stop tracking
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  disabled={trackMutation.isPending}
                  onClick={() => trackMutation.mutate()}
                >
                  {trackMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Star className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Track event
                </Button>
              )}
              <ShareToFeedButton
                variant="outline"
                label="Share this event to your feed"
                title={`Share ${title}`}
                draft={() =>
                  trackingDraft({
                    eventName: title,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    location: data.location,
                    tier: data.tier,
                  })
                }
              />
              {data.pdgaUrl ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={data.pdgaUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> PDGA page
                  </a>
                </Button>
              ) : null}
            </div>

            <Separator />

            {/* Field strength — scoped to the caller's division */}
            {(() => {
              const divisionGroup =
                data.field.find((g) => g.division === data.odds.divisionCode) ?? null;
              const strength = divisionGroup?.strength ?? data.fieldOverall;
              const scopeLabel = divisionGroup ? divisionGroup.division : null;
              return (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <SectionTitle icon={<Users className="h-4 w-4 text-primary" />}>
                      Field strength {scopeLabel ? `· ${scopeLabel}` : ""}
                    </SectionTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={fieldSync.isPending}
                      onClick={() => fieldSync.mutate()}
                    >
                      {fieldSync.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Pull field from PDGA
                    </Button>
                  </div>
                  {strength.players === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No field published yet. Pull the field from PDGA once registration opens and
                      it will appear here.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="Registrants" value={String(strength.players)} />
                        <Stat
                          label="Average rating"
                          value={
                            strength.averageRating ? String(strength.averageRating) : "Unrated"
                          }
                        />
                        <Stat
                          label="Top 10 average"
                          value={strength.top10Average ? String(strength.top10Average) : "Unrated"}
                        />
                        <Stat
                          label="Rating spread"
                          value={
                            strength.spread != null ? `${strength.spread} pts` : "Not enough data"
                          }
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {scopeLabel
                          ? `${strength.ratedPct}% of the ${scopeLabel} field has a published rating · ${data.fieldOverall.players} registered across all divisions`
                          : `${data.fieldOverall.ratedPct}% of the field has a published rating`}
                        {data.fieldSyncedAt
                          ? ` · field synced ${new Date(data.fieldSyncedAt).toLocaleString()}`
                          : ""}
                      </p>
                    </>
                  )}
                </section>
              );
            })()}

            {/* Divisions and players */}
            {data.field.length ? (
              <section className="space-y-2">
                <SectionTitle icon={<Trophy className="h-4 w-4 text-primary" />}>
                  Divisions
                </SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {data.odds.divisionsAvailable.map((code) => (
                    <Button
                      key={code}
                      size="sm"
                      variant={data.odds.divisionCode === code ? "default" : "outline"}
                      onClick={() => setDivision(code)}
                    >
                      {code}
                    </Button>
                  ))}
                </div>
                {data.field
                  .filter((g) => !data.odds.divisionCode || g.division === data.odds.divisionCode)
                  .map((g) => (
                    <div key={g.division} className="rounded-lg border">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs">
                        <span className="font-semibold">{g.division}</span>
                        <span className="text-muted-foreground">
                          {g.strength.players} players ·{" "}
                          {g.strength.averageRating
                            ? `avg ${g.strength.averageRating}`
                            : "ratings not published"}
                        </span>
                      </div>
                      <ul className="max-h-64 divide-y overflow-y-auto text-xs">
                        {g.players.slice(0, 60).map((p) => (
                          <li
                            key={`${p.pdgaNumber}-${p.division}`}
                            className="flex items-center gap-2 px-3 py-1.5"
                          >
                            <span className="w-10 shrink-0 text-muted-foreground">
                              {p.place ? `#${p.place}` : ""}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <span className="shrink-0 text-muted-foreground">#{p.pdgaNumber}</span>
                            <span className="w-12 shrink-0 text-right font-medium">
                              {p.rating ?? "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {g.players.length > 60 ? (
                        <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                          Showing the top 60 rated players of {g.players.length}.
                        </p>
                      ) : null}
                    </div>
                  ))}
              </section>
            ) : null}

            {/* Odds */}
            <section className="space-y-2">
              <SectionTitle icon={<TrendingUp className="h-4 w-4 text-primary" />}>
                Your odds if you played
              </SectionTitle>
              {data.odds.result ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Win" value={`${data.odds.result.winPct}%`} />
                    <Stat label="Top 3" value={`${data.odds.result.top3Pct}%`} />
                    <Stat label="Cash" value={`${data.odds.result.cashPct}%`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Simulated from your {data.odds.myRating} rating against {data.odds.opponents}{" "}
                    rated players in {data.odds.divisionCode ?? "this field"} · cash line estimated
                    at {data.odds.cashLine} spots.
                  </p>
                  <ShareToFeedButton
                    size="sm"
                    variant="outline"
                    label="Share my odds"
                    draft={() =>
                      eventOddsDraft({
                        eventName: title,
                        divisionCode: data.odds.divisionCode,
                        myRating: data.odds.myRating,
                        opponents: data.odds.opponents,
                        winPct: data.odds.result!.winPct,
                        top3Pct: data.odds.result!.top3Pct,
                        cashPct: data.odds.result!.cashPct,
                      })
                    }
                  />
                </>
              ) : data.odds.unavailableReason === "no_rating" ? (
                <p className="text-sm text-muted-foreground">
                  Link your PDGA number in settings so we can simulate your odds against this field.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Odds need published ratings for this field. Pull the field from PDGA and check
                  back.
                </p>
              )}
            </section>

            {/* Courses and rounds */}
            <section className="space-y-2">
              <SectionTitle icon={<CalendarDays className="h-4 w-4 text-primary" />}>
                Courses & rounds
              </SectionTitle>
              {!data.tracked ? (
                <p className="text-sm text-muted-foreground">
                  Track this event to pull its rounds, pools, courses, and tee times as PDGA
                  publishes them.
                </p>
              ) : data.rounds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  PDGA hasn't published rounds for this event yet.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border text-xs">
                  {data.rounds.map((r) => (
                    <li
                      key={`${r.roundNumber}-${r.pool ?? ""}-${r.division ?? ""}`}
                      className="px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.label ?? `Round ${r.roundNumber}`}</span>
                        {r.pool ? (
                          <Badge variant="outline" className="text-[10px]">
                            Pool {r.pool}
                          </Badge>
                        ) : null}
                        {r.division ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {r.division}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-muted-foreground">
                        {dateFmt(r.date)
                          ? `${dateFmt(r.date)}${r.dateExpected ? " (expected)" : ""}`
                          : "Date TBD"}{" "}
                        ·{" "}
                        {r.courseName
                          ? r.courseLayout
                            ? `${r.courseName} (${r.courseLayout})`
                            : r.courseName
                          : "Course TBD"}{" "}
                        ·{" "}
                        {r.teeWindowStart
                          ? `${r.startType === "shotgun" ? "Shotgun" : "Tee times"} from ${r.teeWindowStart}${
                              r.teeWindowEnd ? `–${r.teeWindowEnd}` : ""
                            }`
                          : "Tee times not published"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Friends */}
            <section className="space-y-2">
              <SectionTitle icon={<Users className="h-4 w-4 text-primary" />}>
                Friends in this field
              </SectionTitle>
              {data.friends.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None of your friends with linked PDGA numbers are registered — that we can see
                  yet.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border text-xs">
                  {data.friends.map((f) => (
                    <li key={f.userId} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{f.displayName}</span>
                      <span className="text-muted-foreground">{f.division ?? "Division TBD"}</span>
                      <span className="w-12 text-right">{f.rating ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Standings */}
            {data.standings.length ? (
              <section className="space-y-2">
                <SectionTitle icon={<Trophy className="h-4 w-4 text-primary" />}>
                  Standings {data.odds.divisionCode ? `· ${data.odds.divisionCode}` : ""}
                </SectionTitle>
                <ul className="divide-y rounded-lg border text-xs">
                  {data.standings.map((s) => (
                    <li
                      key={`${s.place}-${s.pdgaNumber}`}
                      className="flex items-center gap-2 px-3 py-1.5"
                    >
                      <span className="w-8 font-semibold">#{s.place}</span>
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="text-muted-foreground">
                        {s.totalToPar != null
                          ? s.totalToPar > 0
                            ? `+${s.totalToPar}`
                            : s.totalToPar
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
