import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ClipboardList, Printer, Shield } from "lucide-react";
import { PageHeader, ContentCard } from "@/components/shell";
import { DirectorErrorState } from "@/components/director/director-error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/current-user";
import { getEventKit } from "@/lib/director.functions";
import {
  DirectorEventPicker,
  useDirectorEventOptions,
} from "@/components/director/director-event-picker";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";
import { money, type EventKit, type KitHole, type KitLayout } from "@/lib/director-kit";

type Search = { event?: string; sheet?: string };

export const Route = createFileRoute("/_authenticated/director/kit")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    event: typeof s.event === "string" ? s.event : undefined,
    sheet: typeof s.sheet === "string" ? s.sheet : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Event kit · DG Dashboard" },
      {
        name: "description",
        content:
          "Print tee signs, a caddy guide, and the player pack straight from your event's real layouts, pars, and schedule.",
      },
      { property: "og:title", content: "Event kit — DG Dashboard" },
      {
        property: "og:description",
        content: "Tee signs, caddy guide, and player pack generated from your event data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventKitPage,
});

const time = (v: string | null) =>
  v ? new Date(v).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
const day = (v: string) =>
  new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

function EventKitPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useSession();
  const userId = user?.id ?? null;

  const fetchKit = useServerFn(getEventKit);

  const eventsQuery = useDirectorEventOptions(userId, "");

  const events = eventsQuery.data ?? [];
  const eventId = search.event ?? events[0]?.id ?? null;

  const kitQuery = useQuery({
    queryKey: directorKeys.kit(eventId),
    enabled: !!eventId,
    staleTime: DIRECTOR_STALE.long,
    queryFn: () => fetchKit({ data: { tournamentId: eventId! } }),
  });

  const kit = kitQuery.data ?? null;

  return (
    <div className="space-y-4">
      <div className="print-hide space-y-4">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3 w-3" /> Event Director
            </span>
          }
          title="Event kit"
          description="Tee signs, the caddy guide, and the player pack — built from this event's real layouts, pars, distances, and schedule."
          primaryAction={
            <Button size="sm" onClick={() => window.print()} disabled={!kit}>
              <Printer className="mr-1 h-4 w-4" />
              Print current sheet
            </Button>
          }
        />

        <div className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-card p-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor="kit-event">
              Event
            </label>
            <DirectorEventPicker
              id="kit-event"
              userId={userId}
              value={eventId ?? ""}
              onChange={(v) => void navigate({ search: (prev) => ({ ...prev, event: v }) })}
            />
          </div>
        </div>

        {eventsQuery.isSuccess && events.length === 0 ? (
          <ContentCard
            title="No events to print yet"
            subtitle="Create a tournament and add a layout — then tee signs and the caddy guide generate themselves."
          />
        ) : null}

        {kitQuery.isPending && eventId ? <Skeleton className="h-40 w-full rounded-card" /> : null}

        {kitQuery.isError ? (
          <DirectorErrorState
            title="That event kit didn't load"
            onRetry={() => void kitQuery.refetch()}
          />
        ) : null}

        {kit && kit.warnings.length > 0 ? (
          <ContentCard
            title="Fill these in before you print"
            subtitle="Anything missing here prints as a blank on the sheet."
          >
            <ul className="space-y-1.5">
              {kit.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[13px]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {w}
                </li>
              ))}
            </ul>
          </ContentCard>
        ) : null}
      </div>

      {kit ? (
        <Tabs
          value={search.sheet ?? "tee-signs"}
          onValueChange={(v) => void navigate({ search: (prev) => ({ ...prev, sheet: v }) })}
        >
          <TabsList className="print-hide">
            <TabsTrigger value="tee-signs">Tee signs</TabsTrigger>
            <TabsTrigger value="caddy">Caddy guide</TabsTrigger>
            <TabsTrigger value="pack">Player pack</TabsTrigger>
          </TabsList>

          <TabsContent value="tee-signs" className="mt-4">
            <TeeSigns kit={kit} />
          </TabsContent>
          <TabsContent value="caddy" className="mt-4">
            <CaddyGuide kit={kit} />
          </TabsContent>
          <TabsContent value="pack" className="mt-4">
            <PlayerPack kit={kit} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

function LayoutHeading({ layout, eventName }: { layout: KitLayout; eventName: string }) {
  return (
    <div className="mb-3 border-b border-border pb-2 print-border">
      <h2 className="font-display text-xl font-semibold">{layout.courseName}</h2>
      <p className="text-[13px] text-muted-foreground">
        {eventName} · {layout.name} · {layout.holeCount} holes
        {layout.parTotal ? ` · par ${layout.parTotal}` : ""}
        {layout.distanceTotal ? ` · ${layout.distanceTotal.toLocaleString()} ft` : ""}
      </p>
    </div>
  );
}

function TeeSigns({ kit }: { kit: EventKit }) {
  if (kit.layouts.length === 0) {
    return (
      <ContentCard
        title="No layout assigned yet"
        subtitle="Assign a course layout to this event and every hole's tee sign generates from its par and distance."
      />
    );
  }
  return (
    <div className="print-kit space-y-6">
      {kit.layouts.map((layout) => (
        <section key={layout.id} className="print-page">
          <LayoutHeading layout={layout} eventName={kit.event.name} />
          <div className="grid gap-3 sm:grid-cols-2">
            {layout.holes.map((h) => (
              <TeeSign key={h.number} hole={h} layout={layout} eventName={kit.event.name} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TeeSign({
  hole,
  layout,
  eventName,
}: {
  hole: KitHole;
  layout: KitLayout;
  eventName: string;
}) {
  return (
    <article className="rounded-card border-2 border-border p-4 print-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
            {eventName}
          </div>
          <div className="font-display text-5xl font-bold leading-none">{hole.number}</div>
          {hole.nickname ? <div className="text-sm font-semibold">{hole.nickname}</div> : null}
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-semibold">Par {hole.par}</div>
          <div className="text-sm">
            {hole.distanceFt ? `${hole.distanceFt.toLocaleString()} ft` : "Distance TBD"}
          </div>
          <div className="text-[12px] text-muted-foreground">{hole.teeName ?? layout.name}</div>
        </div>
      </div>
      {hole.hazards.length + hole.mappedFeatures.length > 0 ? (
        <p className="mt-2 text-[13px]">
          <span className="font-semibold">OB &amp; hazards:</span>{" "}
          {[...hole.hazards, ...hole.mappedFeatures].join(" · ")}
        </p>
      ) : null}

      {hole.caddyNotes ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{hole.caddyNotes}</p>
      ) : null}
    </article>
  );
}

function CaddyGuide({ kit }: { kit: EventKit }) {
  return (
    <div className="print-kit space-y-6">
      <section className="print-page">
        <h2 className="font-display text-2xl font-semibold">{kit.event.name} caddy guide</h2>
        <p className="text-[13px] text-muted-foreground">
          {day(kit.event.startDate)}
          {kit.event.endDate !== kit.event.startDate ? ` – ${day(kit.event.endDate)}` : ""}
          {kit.event.location ? ` · ${kit.event.location}` : ""}
          {kit.event.pdgaSanctioned ? ` · PDGA ${kit.event.pdgaTier ?? "sanctioned"}` : ""}
        </p>

        <h3 className="mt-4 font-semibold">Schedule</h3>
        {kit.rounds.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No rounds added yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-[13px]">
            {kit.rounds.map((r) => (
              <li key={r.id} className="border-b border-border/60 py-1 print-border">
                <span className="font-semibold">Round {r.roundNumber}</span>
                {r.startsAt ? ` · ${day(r.startsAt)}` : ""}
                {" · "}
                {r.shotgunTime
                  ? `Shotgun ${time(r.shotgunTime)}`
                  : r.teeTimeStart
                    ? `Tee times from ${time(r.teeTimeStart)}`
                    : "Start time TBD"}
                {r.courseName ? ` · ${r.courseName}` : " · Course TBD"}
                {r.layoutName ? ` (${r.layoutName})` : ""}
                {r.notes ? ` — ${r.notes}` : ""}
              </li>
            ))}
          </ul>
        )}

        {kit.event.playersMeetingAt || kit.event.checkInOpens ? (
          <p className="mt-3 text-[13px]">
            {kit.event.checkInOpens ? `Check-in opens ${time(kit.event.checkInOpens)}. ` : ""}
            {kit.event.playersMeetingAt
              ? `Players meeting at ${time(kit.event.playersMeetingAt)}.`
              : ""}
          </p>
        ) : null}
      </section>

      {kit.layouts.map((layout) => (
        <section key={layout.id} className="print-page">
          <LayoutHeading layout={layout} eventName={kit.event.name} />
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left print-border">
                <th className="py-1 pr-2">Hole</th>
                <th className="py-1 pr-2">Par</th>
                <th className="py-1 pr-2">Distance</th>
                <th className="py-1">Play it like this</th>
              </tr>
            </thead>
            <tbody>
              {layout.holes.map((h) => (
                <tr key={h.number} className="border-b border-border/60 align-top print-border">
                  <td className="py-1 pr-2 font-semibold">
                    {h.number}
                    {h.nickname ? ` · ${h.nickname}` : ""}
                  </td>
                  <td className="py-1 pr-2">{h.par}</td>
                  <td className="py-1 pr-2">
                    {h.distanceFt ? `${h.distanceFt.toLocaleString()} ft` : "—"}
                  </td>
                  <td className="py-1">
                    {h.caddyNotes ?? "No notes yet"}
                    {h.hazards.length + h.mappedFeatures.length > 0
                      ? ` · OB: ${[...h.hazards, ...h.mappedFeatures].join(", ")}`
                      : ""}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function PlayerPack({ kit }: { kit: EventKit }) {
  const e = kit.event;
  return (
    <div className="print-kit">
      <section className="print-page space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{e.name} player pack</h2>
          <p className="text-[13px] text-muted-foreground">
            {day(e.startDate)}
            {e.endDate !== e.startDate ? ` – ${day(e.endDate)}` : ""}
            {e.location ? ` · ${e.location}` : ""}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ContentCard title="Entry" subtitle="What players pay">
            <ul className="space-y-1 text-[13px]">
              <li>Entry fee: {money(e.entryFeeCents)}</li>
              <li>
                Players pack: {e.playersPackCents ? money(e.playersPackCents) : "Not included"}
              </li>
              {e.acePot ? <li>Ace pot available</li> : null}
              {e.ctp ? <li>CTP contests on select holes</li> : null}
              {e.refundPolicy ? <li>Refunds: {e.refundPolicy}</li> : null}
            </ul>
          </ContentCard>
          <ContentCard title="Run of show" subtitle="Where to be, when">
            <ul className="space-y-1 text-[13px]">
              {e.checkInOpens ? <li>Check-in opens {time(e.checkInOpens)}</li> : null}
              {e.playersMeetingAt ? <li>Players meeting {time(e.playersMeetingAt)}</li> : null}
              {kit.rounds.map((r) => (
                <li key={r.id}>
                  Round {r.roundNumber}:{" "}
                  {r.shotgunTime
                    ? `shotgun ${time(r.shotgunTime)}`
                    : r.teeTimeStart
                      ? `tee times from ${time(r.teeTimeStart)}`
                      : "start time TBD"}
                  {r.courseName ? ` at ${r.courseName}` : ""}
                </li>
              ))}
            </ul>
          </ContentCard>
        </div>

        <ContentCard title="Divisions" subtitle="Who's playing what">
          {kit.divisions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No divisions added yet.</p>
          ) : (
            <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
              {kit.divisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Badge variant="outline" className="mr-1">
                      {d.code}
                    </Badge>
                    {d.name}
                  </span>
                  <span className="text-muted-foreground">
                    {d.players} in · {money(d.entryFeeCents || e.entryFeeCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ContentCard>

        <ContentCard title="Questions on event day" subtitle="Tournament director contact">
          <ul className="space-y-1 text-[13px]">
            <li>{e.tdName ?? "TD name not set"}</li>
            {e.tdEmail ? <li>{e.tdEmail}</li> : null}
            {e.tdPhone ? <li>{e.tdPhone}</li> : null}
            {e.rulesUrl ? <li>Rules: {e.rulesUrl}</li> : null}
            {e.websiteUrl ? <li>Event site: {e.websiteUrl}</li> : null}
          </ul>
        </ContentCard>

        {e.playerPackNotes ? (
          <ContentCard title="Notes from the TD" subtitle="Read before round one">
            <p className="whitespace-pre-wrap text-[13px]">{e.playerPackNotes}</p>
          </ContentCard>
        ) : null}

        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground print-hide">
          <ClipboardList className="h-3.5 w-3.5" />
          Print this and hand it out at check-in, or share the event page link with players.
        </p>
      </section>
    </div>
  );
}
