import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CalendarDays, CheckCircle2, Send, Users, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell, PageHeader } from "@/components/shell";

import {
  listFriendsForCompare,
  getCalendarsForCompare,
  setCalendarShareWithFriends,
  proposeRoundWithFriends,
} from "@/lib/calendar-compare.functions";

export const Route = createFileRoute("/_authenticated/schedule/compare")({
  head: () => ({
    meta: [
      { title: "Compare calendars · Schedule · DG Dashboard" },
      {
        name: "description",
        content:
          "Compare your disc golf schedule with friends and find the best day to play a round together.",
      },
      { property: "og:title", content: "Compare Calendars — DG Dashboard" },
      {
        property: "og:description",
        content: "Find shared open days with your crew and lock in the next round.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComparePage,
});

type Friend = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  calendar_shared_with_friends: boolean;
};

type SchedEvent = {
  id: string;
  title: string;
  source: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
};

type Participant = {
  profile: Friend | null;
  events: SchedEvent[];
  shared: boolean;
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function dateInEvent(day: string, ev: SchedEvent): boolean {
  if (!ev.starts_on) return false;
  const end = ev.ends_on ?? ev.starts_on;
  return day >= ev.starts_on && day <= end;
}

function ComparePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFriendsForCompare);
  const getCals = useServerFn(getCalendarsForCompare);
  const setShare = useServerFn(setCalendarShareWithFriends);
  const proposeFn = useServerFn(proposeRoundWithFriends);

  const [selected, setSelected] = useState<string[]>([]);
  const [from, setFrom] = useState(todayISO(0));
  const [to, setTo] = useState(todayISO(30));
  const [proposeDate, setProposeDate] = useState<string | null>(null);
  const [proposeTitle, setProposeTitle] = useState("Casual Round");
  const [proposeLocation, setProposeLocation] = useState("");
  const [proposeNotes, setProposeNotes] = useState("");

  const friendsQ = useQuery({
    queryKey: ["compare-friends"],
    queryFn: () => listFn({}),
  });

  const compareQ = useQuery({
    queryKey: ["compare-calendars", selected.join(","), from, to],
    queryFn: () => getCals({ data: { friendIds: selected, from, to } }),
    enabled: from <= to,
  });

  const shareMut = useMutation({
    mutationFn: (enabled: boolean) => setShare({ data: { enabled } }),
    onSuccess: () => {
      toast.success("Calendar sharing updated");
      qc.invalidateQueries({ queryKey: ["compare-friends"] });
      qc.invalidateQueries({ queryKey: ["compare-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update sharing"),
  });

  const proposeMut = useMutation({
    mutationFn: (payload: {
      friendIds: string[];
      date: string;
      title: string;
      location?: string;
      notes?: string;
    }) => proposeFn({ data: payload }),
    onSuccess: (r) => {
      toast.success(`Round proposed — ${r.invited} friend${r.invited === 1 ? "" : "s"} notified`);
      setProposeDate(null);
      setProposeLocation("");
      setProposeNotes("");
      qc.invalidateQueries({ queryKey: ["compare-calendars"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send invite"),
  });

  const days = useMemo(() => (from <= to ? eachDay(from, to) : []), [from, to]);
  const participants: Participant[] = (compareQ.data?.participants ?? []) as Participant[];
  const meShared = compareQ.data?.me?.calendar_shared_with_friends ?? true;
  const hiddenCount = (compareQ.data?.hidden_friend_ids ?? []).length;

  const openDays = useMemo(() => {
    if (participants.length < 2) return [] as string[];
    return days.filter((d) =>
      participants.every((p) => !p.events.some((ev) => dateInEvent(d, ev))),
    );
  }, [days, participants]);

  function friendLabel(f: Friend | null) {
    if (!f) return "Unknown";
    return f.display_name || f.username || "Player";
  }

  function toggleFriend(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const friends: Friend[] = (friendsQ.data ?? []) as Friend[];

  return (
    <PageShell section="play">
      <PageHeader
        eyebrow="Schedule"
        leading={<Users className="h-6 w-6 text-primary" aria-hidden />}
        title="Compare calendars"
        description="Pick friends, see who's busy when, and lock in the next round on a day everyone is free."
        secondaryAction={
          <Button asChild variant="outline" size="sm">
            <Link to="/schedule">
              <CalendarDays className="mr-2 h-4 w-4" /> Back to calendar
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your sharing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Let accepted friends see your schedule on this page.
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">{meShared ? "Sharing on" : "Sharing off"}</span>
            <Switch
              checked={meShared}
              onCheckedChange={(v) => shareMut.mutate(v)}
              disabled={shareMut.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pick your crew</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">From</span>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">To</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>

          {friendsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading friends…</div>
          ) : friends.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No friends to compare yet"
              description="Add friends from the Community tab to start comparing calendars."
              accent="accent-friends"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {friends.map((f) => {
                const active = selected.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFriend(f.id)}
                    className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm transition ${
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={f.avatar_url ?? undefined} alt="" />
                      <AvatarFallback>{friendLabel(f).slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span>{friendLabel(f)}</span>
                    {!f.calendar_shared_with_friends && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-500">
                        private
                      </span>
                    )}
                    {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {hiddenCount > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                {hiddenCount} friend{hiddenCount === 1 ? " has" : "s have"} calendar sharing off —
                their days aren't shown.
              </div>
            )}

            {openDays.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-medium">Open days for everyone</div>
                <div className="flex flex-wrap gap-2">
                  {openDays.slice(0, 30).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setProposeDate(d)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        proposeDate === d
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                      }`}
                    >
                      {new Date(d + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {compareQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading calendars…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium text-muted-foreground">
                        Player
                      </th>
                      {days.slice(0, 21).map((d) => (
                        <th
                          key={d}
                          className="px-1 py-2 text-center text-[10px] font-normal text-muted-foreground"
                        >
                          {new Date(d + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short",
                          })}
                          <div className="text-[10px]">{new Date(d + "T00:00:00").getDate()}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.profile?.id} className="align-middle">
                        <td className="sticky left-0 z-10 bg-card px-2 py-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={p.profile?.avatar_url ?? undefined} alt="" />
                              <AvatarFallback>{friendLabel(p.profile).slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{friendLabel(p.profile)}</span>
                          </div>
                        </td>
                        {days.slice(0, 21).map((d) => {
                          const ev = p.events.find((e) => dateInEvent(d, e));
                          return (
                            <td key={d} className="border-t border-border px-1 py-1 text-center">
                              {ev ? (
                                <span
                                  title={`${ev.title}${ev.city ? ` — ${ev.city}${ev.state ? ", " + ev.state : ""}` : ""}`}
                                  className="inline-block h-2 w-2 rounded-full bg-red-500"
                                />
                              ) : (
                                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/50" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <details className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Show event details</summary>
              <div className="mt-3 space-y-3">
                {participants.map((p) => (
                  <div key={p.profile?.id}>
                    <div className="mb-1 font-medium">{friendLabel(p.profile)}</div>
                    {p.events.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No events in this range.</div>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {p.events.map((ev) => (
                          <li key={ev.id} className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {ev.source}
                            </Badge>
                            <span className="text-muted-foreground">
                              {ev.starts_on}
                              {ev.ends_on && ev.ends_on !== ev.starts_on ? ` → ${ev.ends_on}` : ""}
                            </span>
                            <span>{ev.title}</span>
                            {ev.city && (
                              <span className="text-muted-foreground">
                                — {ev.city}
                                {ev.state ? `, ${ev.state}` : ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {selected.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Propose a round</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={proposeDate ?? ""}
                  min={from}
                  max={to}
                  onChange={(e) => setProposeDate(e.target.value || null)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Title</label>
                <Input value={proposeTitle} onChange={(e) => setProposeTitle(e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-muted-foreground">
                  Course / location (optional)
                </label>
                <Input
                  value={proposeLocation}
                  onChange={(e) => setProposeLocation(e.target.value)}
                  placeholder="e.g. Maple Hill"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-muted-foreground">Notes (optional)</label>
                <Textarea
                  rows={2}
                  value={proposeNotes}
                  onChange={(e) => setProposeNotes(e.target.value)}
                  placeholder="Meet at the first tee at 10am"
                />
              </div>
            </div>
            <Button
              disabled={!proposeDate || !proposeTitle.trim() || proposeMut.isPending}
              onClick={() =>
                proposeMut.mutate({
                  friendIds: selected,
                  date: proposeDate!,
                  title: proposeTitle.trim(),
                  location: proposeLocation.trim() || undefined,
                  notes: proposeNotes.trim() || undefined,
                })
              }
            >
              <Send className="mr-2 h-4 w-4" />
              {proposeMut.isPending
                ? "Sending…"
                : `Send invite to ${selected.length} friend${selected.length === 1 ? "" : "s"}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
