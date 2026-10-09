import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  searchPdgaPlayerToTrack,
  searchPdgaPlayersByName,
  trackPdgaPlayer,
  untrackPdgaPlayer,
  type PdgaPlayerNameMatch,
  type PdgaPlayerSearchResult,
} from "@/lib/tracker-player-search.functions";
import { trackerKeys } from "@/lib/tracker-queries";

function formatRange(start: string | null, end: string | null): string {
  if (!start) return "Dates TBD";
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDay(value: string | null): string {
  if (!value) return "Date TBD";
  return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function placeLabel(place: number | null): string {
  if (place == null) return "Result pending";
  if (place === 1) return "Won it";
  const suffix =
    place % 10 === 2 && place !== 12
      ? "nd"
      : place % 10 === 3 && place !== 13
        ? "rd"
        : place % 10 === 1 && place !== 11
          ? "st"
          : "th";
  return `${place}${suffix} place`;
}

/**
 * Player tracker: look up any PDGA member by name or number — no friendship or
 * crew required — review their published scoring and rating trend, then follow
 * them in your personal tracker or add them to a crew.
 */
export function PdgaPlayerSearchCard({ bare = false }: { bare?: boolean }) {
  const lookup = useServerFn(searchPdgaPlayerToTrack);
  const searchByName = useServerFn(searchPdgaPlayersByName);
  const track = useServerFn(trackPdgaPlayer);
  const untrack = useServerFn(untrackPdgaPlayer);
  const queryClient = useQueryClient();

  const [value, setValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<PdgaPlayerNameMatch[] | null>(null);
  const [result, setResult] = useState<PdgaPlayerSearchResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const loadPlayer = async (pdgaNumber: string) => {
    setSearching(true);
    setProblem(null);
    try {
      const res = await lookup({ data: { pdga_number: pdgaNumber } });
      setResult(res);
      setMatches(null);
      setGroupId("");
    } catch (e) {
      setResult(null);
      setProblem(e instanceof Error ? e.message : "That lookup didn't come back.");
    } finally {
      setSearching(false);
    }
  };

  const runSearch = async () => {
    const term = value.trim();
    if (!term) {
      toast.error("Search a player name or PDGA number.");
      return;
    }
    const digits = term.replace(/\D/g, "");
    if (digits && digits.length === term.length) {
      await loadPlayer(digits);
      return;
    }
    if (term.length < 2) {
      toast.error("Use at least two letters of their name.");
      return;
    }
    setSearching(true);
    setProblem(null);
    try {
      const found = await searchByName({ data: { query: term } });
      setResult(null);
      setMatches(found);
      if (!found.length) {
        setProblem(`No PDGA member matched “${term}”. Try their PDGA number instead.`);
      }
    } catch (e) {
      setMatches(null);
      setProblem(e instanceof Error ? e.message : "That search didn't come back.");
    } finally {
      setSearching(false);
    }
  };

  const followPlayer = async (crewId?: string) => {
    if (!result) return;
    setBusy(true);
    try {
      const res = await track({
        data: {
          pdga_number: result.pdgaNumber,
          display_name: result.name,
          ...(crewId ? { group_id: crewId } : {}),
        },
      });
      const who = result.name ?? `#${result.pdgaNumber}`;
      toast[res.duplicate ? "info" : "success"](
        res.duplicate
          ? `${who} is already tracked in ${res.group.name}`
          : `Now tracking ${who} in ${res.group.name}`,
      );
      void queryClient.invalidateQueries({ queryKey: trackerKeys.groups() });
      setResult((prev) =>
        prev
          ? {
              ...prev,
              trackedInGroups: prev.trackedInGroups.some((g) => g.id === res.group.id)
                ? prev.trackedInGroups
                : [...prev.trackedInGroups, res.group],
              availableGroups: prev.availableGroups.filter((g) => g.id !== res.group.id),
            }
          : prev,
      );
      setGroupId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't track that player");
    } finally {
      setBusy(false);
    }
  };

  const stopTracking = async (crew: { id: string; name: string }) => {
    if (!result) return;
    setBusy(true);
    try {
      await untrack({ data: { pdga_number: result.pdgaNumber, group_id: crew.id } });
      toast.success(`Stopped tracking in ${crew.name}`);
      void queryClient.invalidateQueries({ queryKey: trackerKeys.groups() });
      setResult((prev) =>
        prev
          ? {
              ...prev,
              trackedInGroups: prev.trackedInGroups.filter((g) => g.id !== crew.id),
              availableGroups: prev.availableGroups.some((g) => g.id === crew.id)
                ? prev.availableGroups
                : [...prev.availableGroups, crew],
            }
          : prev,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop tracking");
    } finally {
      setBusy(false);
    }
  };

  const trend = result?.ratingTrend ?? null;

  return (
    <Card className={bare ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        {bare ? (
          <p className="text-xs text-muted-foreground">
            Search any PDGA member by name or number, then follow them to watch their rating, round
            scores, and upcoming events.
          </p>
        ) : (
          <>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" /> Look up and track a player
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Search any PDGA member by name or number — pro tour players or the person you play
              next week. No friendship or crew needed: follow them in your personal tracker and
              watch their rating, round scores, and upcoming events.
            </p>
          </>
        )}
      </CardHeader>
      <CardContent className={bare ? "space-y-4 p-0" : "space-y-4"}>
        <div className="flex flex-wrap gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Name or PDGA number — e.g. Paul McBeth or 27523"
            aria-label="Player name or PDGA number"
            className="min-w-[220px] flex-1"
          />
          <Button onClick={() => void runSearch()} disabled={searching}>
            {searching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="mr-1.5 h-3.5 w-3.5" />
            )}
            Search players
          </Button>
        </div>

        {problem ? <p className="text-sm text-destructive">{problem}</p> : null}

        {matches?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {matches.length} match{matches.length === 1 ? "" : "es"} — pick a player
            </p>
            {matches.map((m) => (
              <button
                key={m.pdgaNumber}
                type="button"
                onClick={() => void loadPlayer(m.pdgaNumber)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="font-medium">{m.name ?? `PDGA #${m.pdgaNumber}`}</span>
                  <span className="ml-2 text-xs text-muted-foreground">#{m.pdgaNumber}</span>
                  {m.location ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {m.location}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  {m.rating ? (
                    <Badge variant="outline" className="text-[11px]">
                      {m.rating} rated
                    </Badge>
                  ) : null}
                  {m.careerWins ? (
                    <Badge variant="secondary" className="text-[11px]">
                      <Trophy className="mr-1 h-3 w-3" /> {m.careerWins} wins
                    </Badge>
                  ) : null}
                  {m.trackedIn?.length ? (
                    <Badge variant="secondary" className="text-[11px]">
                      <Check className="mr-1 h-3 w-3" /> Tracking in {m.trackedIn.join(", ")}
                    </Badge>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{result.name ?? `PDGA #${result.pdgaNumber}`}</span>
                  <Badge variant="secondary" className="text-[11px]">
                    #{result.pdgaNumber}
                  </Badge>
                  {result.rating ? (
                    <Badge variant="outline" className="text-[11px]">
                      {result.rating} rated
                    </Badge>
                  ) : null}
                  {result.classification ? (
                    <Badge variant="outline" className="text-[11px]">
                      {result.classification}
                    </Badge>
                  ) : null}
                  {result.careerWins ? (
                    <Badge variant="outline" className="text-[11px]">
                      <Trophy className="mr-1 h-3 w-3" /> {result.careerWins} career wins
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {result.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {result.location}
                    </span>
                  ) : null}
                  <a
                    href={result.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> View their PDGA profile
                  </a>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy} onClick={() => void followPlayer()}>
                  {busy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Track this player
                </Button>
                {result.availableGroups.length ? (
                  <>
                    <Select value={groupId} onValueChange={setGroupId}>
                      <SelectTrigger className="h-9 w-[180px]" aria-label="Choose a crew">
                        <SelectValue placeholder="Add to a crew" />
                      </SelectTrigger>
                      <SelectContent>
                        {result.availableGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!groupId || busy}
                      onClick={() => void followPlayer(groupId)}
                    >
                      <Users className="mr-1.5 h-3.5 w-3.5" /> Add to crew
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {result.trackedInGroups.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" /> Tracked in
                {result.trackedInGroups.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1">
                    <Badge variant="secondary" className="text-[11px]">
                      {g.name}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={busy}
                      aria-label={`Stop tracking in ${g.name}`}
                      onClick={() => void stopTracking(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recent scoring
                </p>
                {result.recentRatingAverage ? (
                  <p className="flex items-center gap-1.5 text-sm">
                    <span className="font-medium">{result.recentRatingAverage}</span>
                    <span className="text-muted-foreground">
                      average over their last {result.recentRounds.length} rounds
                    </span>
                    {trend != null && trend !== 0 ? (
                      <span
                        className={
                          trend > 0
                            ? "inline-flex items-center gap-1 text-xs text-primary"
                            : "inline-flex items-center gap-1 text-xs text-muted-foreground"
                        }
                      >
                        {trend > 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {trend > 0 ? `+${trend}` : trend} vs current rating
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    PDGA hasn't published rated rounds for them yet.
                  </p>
                )}
                {result.recentRounds.slice(0, 6).map((round, index) => (
                  <div
                    key={`${round.playedOn ?? "round"}-${round.roundLabel ?? index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{round.eventName ?? "PDGA round"}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {formatDay(round.playedOn)}
                        {round.roundLabel ? <span>· {round.roundLabel}</span> : null}
                        {round.division ? <span>· {round.division}</span> : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      {round.score != null ? (
                        <span className="text-muted-foreground">{round.score}</span>
                      ) : null}
                      {round.rating != null ? (
                        <Badge variant="outline" className="text-[11px]">
                          {round.rating}
                        </Badge>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Recent finishes
                </p>
                {result.recentFinishes.length ? (
                  result.recentFinishes.slice(0, 6).map((finish, index) => (
                    <div
                      key={`${finish.eventName}-${finish.eventDate ?? index}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{finish.eventName}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          {formatDay(finish.eventDate)}
                          {finish.division ? <span>· {finish.division}</span> : null}
                          {finish.tier ? <span>· {finish.tier}</span> : null}
                        </span>
                      </span>
                      <Badge variant="secondary" className="text-[11px]">
                        {placeLabel(finish.place)}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No published finishes yet — they'll appear here after their next event.
                  </p>
                )}

                <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Upcoming PDGA registrations
                </p>
                {result.upcomingEvents.length ? (
                  result.upcomingEvents.slice(0, 5).map((event) => (
                    <div
                      key={event.eventRef}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">
                          {event.name ?? `PDGA event #${event.eventRef}`}
                        </span>
                        {event.tier ? (
                          <Badge variant="secondary" className="ml-2 text-[11px]">
                            {event.tier}
                          </Badge>
                        ) : null}
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />{" "}
                            {formatRange(event.startDate, event.endDate)}
                          </span>
                          {event.location ? <span>{event.location}</span> : null}
                          {event.division ? <span>{event.division}</span> : null}
                        </span>
                      </span>
                      <a
                        href={event.pdgaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> PDGA page
                      </a>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing on their schedule yet. Track them now and this fills in when PDGA posts
                    the field.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
