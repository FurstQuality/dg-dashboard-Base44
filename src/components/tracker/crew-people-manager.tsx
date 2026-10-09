import { DgdBadge } from "@/components/dgd/dgd-badge";
import { useDgdByPdga } from "@/lib/dgd-identity";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, ChevronRight, Loader2, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listTrackerGroups,
  getTrackerGroup,
  addTrackerMember,
  removeTrackerMember,
} from "@/lib/tracker.functions";
import { searchCrewCandidates, type CrewCandidate } from "@/lib/tracker-player-search.functions";
import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";
import { useSession } from "@/lib/current-user";

type GroupRow = Awaited<ReturnType<typeof listTrackerGroups>>[number];

/**
 * Crew people manager. Lives on the My crews page so adding, reviewing, and
 * removing the players in a crew all happen in one place. Search accepts a
 * PDGA number, a DG Dashboard username, or a first and last name.
 */
export function CrewPeopleManager({ bare = false }: { bare?: boolean }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const list = useServerFn(listTrackerGroups);
  const getGroup = useServerFn(getTrackerGroup);
  const addMember = useServerFn(addTrackerMember);
  const removeMember = useServerFn(removeTrackerMember);
  const runSearch = useServerFn(searchCrewCandidates);

  const [groupId, setGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CrewCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: communityKeys.trackerGroups(user?.id),
    queryFn: async () => ((await list()) ?? []) as GroupRow[],
    staleTime: COMMUNITY_STALE.short,
  });

  const crews = useMemo(() => {
    const rows = (groupsQuery.data ?? []).filter(
      (g) => !/^my tracker$/i.test((g.name ?? "").trim()),
    );
    return [...rows].sort((a, b) => Number(b.is_all_time) - Number(a.is_all_time));
  }, [groupsQuery.data]);

  useEffect(() => {
    if (groupId && crews.some((c) => c.id === groupId)) return;
    if (crews.length) setGroupId(crews[0].id);
  }, [crews, groupId]);

  const selected = crews.find((c) => c.id === groupId) ?? null;

  const groupQuery = useQuery({
    queryKey: ["crew-people", groupId],
    queryFn: async () => (groupId ? await getGroup({ data: { id: groupId } }) : null),
    enabled: Boolean(groupId),
    staleTime: COMMUNITY_STALE.short,
  });
  const members = groupQuery.data?.members ?? [];
  const crewDgd = useDgdByPdga(members.map((m: any) => m.pdga_number));
  // Ratings and recent finishes come back with the crew, so each row can show
  // form instead of just a PDGA number.
  const snapshotByNumber = useMemo(() => {
    const map = new Map<string, { current_rating: number | null; finishes: { place: number | null; event_name: string | null }[] }>();
    for (const s of groupQuery.data?.snapshots ?? []) {
      map.set(s.pdga_number, {
        current_rating: s.current_rating ?? null,
        finishes: (s.finishes ?? []) as { place: number | null; event_name: string | null }[],
      });
    }
    return map;
  }, [groupQuery.data]);

  // Debounced directory + PDGA search.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await runSearch({ data: { query: term, group_id: groupId } });
        setResults(rows ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, groupId]);

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["crew-people", groupId] });
    void queryClient.invalidateQueries({ queryKey: communityKeys.trackerGroups(user?.id) });
  }

  async function add(candidate: CrewCandidate) {
    if (!groupId) return;
    if (!candidate.pdgaNumber) {
      toast.error("This player hasn't linked a PDGA number yet, so we can't follow their events.");
      return;
    }
    setBusyKey(candidate.key);
    try {
      await addMember({
        data: {
          group_id: groupId,
          pdga_number: candidate.pdgaNumber,
          display_name: candidate.name,
        },
      });
      toast.success(`${candidate.name} added to ${selected?.name ?? "this crew"}`);
      setQuery("");
      setResults([]);
      refreshAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  async function drop(id: string, name: string) {
    if (!confirm(`Remove ${name} from ${selected?.name ?? "this crew"}?`)) return;
    setBusyKey(id);
    try {
      await removeMember({ data: { id } });
      refreshAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  // Next few dated events the crew is entered in, so this page answers
  // "who am I following" and "what are they playing next" together.
  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (groupQuery.data?.events ?? [])
      .filter((e) => (e.event_date ?? "") >= today)
      .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""))
      .slice(0, 4);
  }, [groupQuery.data]);

  return (
    <Card className={bare ? "border-0 bg-transparent shadow-none" : undefined}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {bare ? (
              <p className="text-sm text-muted-foreground">
                Search by PDGA number, username, or name to follow someone through every event
                they enter.
              </p>
            ) : (
              <>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" /> Crew people
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add someone by PDGA number, DG Dashboard username, or first and last name.
                  Everyone here gets followed through the events they enter.
                </p>
              </>
            )}
          </div>
          {crews.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Crew
            <select
              value={groupId ?? ""}
              onChange={(e) => setGroupId(e.target.value)}
              aria-label="Choose crew"
              className="h-9 max-w-[16rem] rounded-md border bg-background px-2 text-sm text-foreground"
            >
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_all_time ? " · always on" : ""}
                </option>
              ))}
            </select>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className={bare ? "space-y-4 p-0" : "space-y-4"}>
        {groupsQuery.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : !selected ? (
          <p className="text-sm text-muted-foreground">
            Create a crew below and you can start adding players here.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search players — PDGA #, username, or name"
                className="pl-9"
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nobody matched that. Try their PDGA number or full name.
              </p>
            )}

            {results.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {results.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.pdgaNumber ? `PDGA #${c.pdgaNumber}` : "No PDGA number"}
                        {c.rating ? ` · ${c.rating} rated` : ""}
                        {c.username ? ` · @${c.username}` : ""}
                        {c.location ? ` · ${c.location}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {c.isFriend && (
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          Friend
                        </Badge>
                      )}
                      {c.alreadyInCrew ? (
                        <Badge variant="outline" className="h-5 text-[10px]">
                          In crew
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKey === c.key}
                          onClick={() => void add(c)}
                        >
                          {busyKey === c.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="mr-1 h-3.5 w-3.5" /> Add
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {upcoming.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Up next for this crew
                </p>
                <ul className="divide-y rounded-lg border">
                  {upcoming.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                          {e.event_date
                            ? new Date(`${e.event_date}T12:00:00`).toLocaleDateString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })
                            : "Date TBD"}
                          {e.location ? ` · ${e.location}` : ""}
                        </p>
                      </div>
                      {groupId && (
                        <Button asChild variant="ghost" size="sm" className="shrink-0 text-xs">
                          <Link
                            to="/tracker/$groupId/event/$eventId"
                            params={{ groupId, eventId: e.id }}
                          >
                            Open <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                In {selected.name} · {members.length} {members.length === 1 ? "player" : "players"}
              </p>
              {groupQuery.isLoading ? (
                <Skeleton className="h-20 w-full rounded-lg" />
              ) : members.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-6 text-center">
                  <UserPlus className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No players in this crew yet</p>
                  <p className="text-xs text-muted-foreground">
                    Search above to add the first one.
                  </p>
                </div>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {m.display_name || `PDGA #${m.pdga_number}`}
                          {crewDgd.data?.get(String(m.pdga_number)) ? (
                            <span className="ml-2 align-middle"><DgdBadge size="sm" tier={crewDgd.data.get(String(m.pdga_number))!.tier} rating={crewDgd.data.get(String(m.pdga_number))!.dgd_rating} /></span>
                          ) : null}
                          {m.is_you && (
                            <Badge variant="secondary" className="ml-2 h-4 text-[10px]">
                              You
                            </Badge>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          PDGA #{m.pdga_number}
                          {m.default_division ? ` · ${m.default_division}` : ""}
                          {snapshotByNumber.get(m.pdga_number)?.current_rating
                            ? ` · ${snapshotByNumber.get(m.pdga_number)?.current_rating} rated`
                            : ""}
                          {(() => {
                            const last = snapshotByNumber.get(m.pdga_number)?.finishes?.[0];
                            if (!last?.place) return "";
                            return ` · last out ${last.place}${last.event_name ? ` at ${last.event_name}` : ""}`;
                          })()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                      {groupId && (
                        <Button asChild variant="ghost" size="sm" className="text-xs">
                          <Link
                            to="/tracker/$groupId/player/$memberId"
                            params={{ groupId, memberId: m.id }}
                          >
                            View <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.display_name || m.pdga_number}`}
                        disabled={busyKey === m.id}
                        onClick={() => void drop(m.id, m.display_name || `PDGA #${m.pdga_number}`)}
                      >
                        {busyKey === m.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
