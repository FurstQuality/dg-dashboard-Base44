import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, CalendarClock, Flag, ExternalLink } from "lucide-react";
import type { PlayerProfileData } from "@/lib/player-profile.functions";

const fmtToPar = (v: number | null | undefined) =>
  v == null ? null : v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;

/** Turns a raw tee time like "13:50:00" into "1:50 PM"; passes anything else through. */
function teeTimeLabel(raw: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return raw;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${suffix}`;
}

function dateLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function Panel({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Top-of-profile answer to "what are they playing, and how did they just shoot?"
 * Live rows come from PDGA event scoring; the last round falls back to the
 * player's most recent round in DG Dashboard.
 */
export function PlayerNowNextCard({
  nowNext,
  upcoming,
  recentRounds,
  displayName,
  isSelf,
}: {
  nowNext: PlayerProfileData["nowNext"];
  upcoming: PlayerProfileData["upcoming"];
  recentRounds: PlayerProfileData["recentRounds"];
  displayName: string;
  isSelf: boolean;
}) {
  const live = nowNext?.live ?? null;
  const inPlay = live?.current ?? null;
  const finishedToday = live?.finished?.[0] ?? null;
  const last = recentRounds[0] ?? null;
  const appNext = upcoming[0] ?? null;
  const pdgaNext = nowNext?.next ?? null;
  const nextIsApp =
    !!appNext &&
    (!pdgaNext || (appNext.start_date ?? "9999") <= (pdgaNext.startDate ?? "9999"));
  const first = displayName.split(" ")[0] || displayName;

  if (!live && !appNext && !pdgaNext && !last) return null;

  return (
    <Card className="mt-4 border-primary/30">
      <CardContent className="pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {live ? "Playing right now" : isSelf ? "Your next round" : `${first}'s next round`}
          </h2>
          {nowNext?.pdgaMatch === "name" && (
            <Badge variant="outline" className="text-[11px]">
              Matched to PDGA #{nowNext.pdgaNumber} by name
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {live && (
            <Panel
              icon={<Radio className="h-3.5 w-3.5 text-emerald-500" />}
              label={inPlay ? "Live now" : "Playing today"}
            >
              <div className="text-sm font-semibold leading-snug">{live.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {[live.location, live.division, live.tier ? `Tier ${live.tier}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {inPlay ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    Round {inPlay.roundNumber}
                  </Badge>
                  <span className="font-mono">
                    {inPlay.thru > 0
                      ? `Thru ${inPlay.thru}${inPlay.holeCount ? ` of ${inPlay.holeCount}` : ""} · ${fmtToPar(inPlay.roundToPar) ?? "—"}`
                      : inPlay.teeTime
                        ? `Tees off ${teeTimeLabel(inPlay.teeTime)}`
                        : "Not teed off yet"}
                  </span>
                  {inPlay.cardNumber && (
                    <span className="text-muted-foreground">Card {inPlay.cardNumber}</span>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">
                  No round in progress right now.
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {live.current?.place != null && <span>Place {live.current.place}</span>}
                {fmtToPar(live.current?.toPar ?? live.finished[0]?.toPar) && (
                  <span>Event {fmtToPar(live.current?.toPar ?? live.finished[0]?.toPar)}</span>
                )}
              </div>
              <Button asChild size="sm" variant="outline" className="mt-3 h-8">
                <Link to="/events/pdga/$eventRef" params={{ eventRef: live.eventRef }}>
                  Live scores
                </Link>
              </Button>
            </Panel>
          )}

          <Panel icon={<Flag className="h-3.5 w-3.5" />} label={finishedToday ? "Today" : "Last round"}>
            {finishedToday ? (
              <>
                <div className="text-sm font-semibold">
                  Round {finishedToday.roundNumber} · {fmtToPar(finishedToday.roundToPar) ?? "—"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {live?.name}
                  {finishedToday.holeCount ? ` · ${finishedToday.holeCount} holes` : ""}
                </div>
                {finishedToday.place != null && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Sitting {finishedToday.place} overall
                  </div>
                )}
              </>
            ) : last ? (
              <>
                <div className="text-sm font-semibold leading-snug">{last.course_name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {dateLabel(last.played_on)}
                  {last.event_name ? ` · ${last.event_name}` : ""}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {last.score != null && (
                    <span className="font-mono">
                      {last.score}
                      {fmtToPar(last.to_par) ? ` (${fmtToPar(last.to_par)})` : ""}
                    </span>
                  )}
                  {last.round_rating != null && <Badge>{last.round_rating} rated</Badge>}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? "Score a round and it shows up here."
                  : `No rounds logged for ${first} yet.`}
              </p>
            )}
          </Panel>

          <Panel icon={<CalendarClock className="h-3.5 w-3.5" />} label="Next up">
            {nextIsApp && appNext ? (
              <>
                <div className="text-sm font-semibold leading-snug">{appNext.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[dateLabel(appNext.start_date), appNext.location, appNext.division]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {appNext.slug && (
                  <Button asChild size="sm" variant="outline" className="mt-3 h-8">
                    <Link
                      to={appNext.kind === "league" ? "/leagues/$slug" : "/tournaments/$slug"}
                      params={{ slug: appNext.slug }}
                    >
                      View event
                    </Link>
                  </Button>
                )}
              </>
            ) : pdgaNext ? (
              <>
                <div className="text-sm font-semibold leading-snug">{pdgaNext.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[dateLabel(pdgaNext.startDate), pdgaNext.location, pdgaNext.division]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <Button asChild size="sm" variant="outline" className="mt-3 h-8">
                  <a href={pdgaNext.pdgaUrl} target="_blank" rel="noreferrer">
                    Event page <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? "Register for an event and it lands here."
                  : `Nothing on ${first}'s schedule yet.`}
              </p>
            )}
          </Panel>
        </div>
      </CardContent>
    </Card>
  );
}
