import { formatToPar as fmtToPar } from "@/lib/score-display";
import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crewSwatchStyle } from "@/lib/tracker-colors";
import type { TrackerLiveScoreRow } from "@/lib/tracker.functions";

type Member = {
  id: string;
  pdga_number: string;
  display_name: string | null;
  default_division: string | null;
  color: string | null;
};

export interface PlayerActivityBoardProps {
  groupId: string;
  members: Member[];
  scores: TrackerLiveScoreRow[];
  eventNameById: Map<string, string>;
  /** Max round rows shown per player before collapsing. */
  limitPerPlayer?: number;
}

type RoundEntry = {
  key: string;
  eventId: string;
  eventName: string;
  roundNumber: number | null;
  toPar: number | null;
  score: number | null;
  place: number | null;
  thru: number | null;
  live: boolean;
  syncedAt: string;
};


function toParTone(n: number | null): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n < 0 ? "text-emerald-500" : "text-rose-500";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Every tracked player's recent round activity in one place — one block per
 * player, newest rounds first, with live rounds flagged. Renders as a compact
 * stack on phones and a two-column board on desktop.
 */
export function PlayerActivityBoard({
  groupId,
  members,
  scores,
  eventNameById,
  limitPerPlayer = 4,
}: PlayerActivityBoardProps) {
  const byMember = new Map<string, RoundEntry[]>();
  const memberByNum = new Map(members.map((m) => [m.pdga_number, m] as const));
  const memberById = new Map(members.map((m) => [m.id, m] as const));

  for (const s of scores) {
    const m =
      (s.member_id ? memberById.get(s.member_id) : undefined) ?? memberByNum.get(s.pdga_number);
    if (!m) continue;
    // A round that hasn't teed off yet is stored with zeros. Showing it as
    // "E · 0" reads like a played round, so keep it out until there's play.
    const hasPlay =
      !!s.round_started ||
      !!s.completed ||
      (s.thru ?? 0) > 0 ||
      (s.round_score ?? 0) > 0 ||
      (Array.isArray(s.hole_scores) && s.hole_scores.some((n) => n > 0));
    if (!hasPlay) continue;

    const entry: RoundEntry = {
      key: s.id,
      eventId: s.event_id,
      eventName: eventNameById.get(s.event_id) ?? "Event",
      roundNumber: s.round_number,
      toPar: s.round_to_par ?? s.to_par ?? null,
      score: s.round_score ?? s.total ?? null,
      place: s.running_place ?? s.place ?? null,
      thru: s.thru,
      live: !!s.round_started && !s.completed,
      syncedAt: s.last_synced_at ?? "",
    };
    const arr = byMember.get(m.id) ?? [];
    arr.push(entry);
    byMember.set(m.id, arr);
  }

  const blocks = members
    .map((m) => ({
      member: m,
      rounds: (byMember.get(m.id) ?? []).sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        if (a.syncedAt !== b.syncedAt) return b.syncedAt.localeCompare(a.syncedAt);
        return (b.roundNumber ?? 0) - (a.roundNumber ?? 0);
      }),
    }))
    .filter((b) => b.rounds.length > 0);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Player round activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rounds posted yet. Sync from PDGA once your crew tees off and every round shows up
            here.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {blocks.map(({ member, rounds }) => {
              const name = member.display_name || `#${member.pdga_number}`;
              const shown = rounds.slice(0, limitPerPlayer);
              return (
                <div key={member.id} className="overflow-hidden rounded-lg border border-border/70">
                  <div className="flex min-w-0 items-center gap-2 bg-muted/30 px-3 py-2">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-black"
                      style={crewSwatchStyle(member.color)}
                    >
                      {initialsOf(name)}
                    </span>
                    <Link
                      to="/tracker/$groupId/player/$memberId"
                      params={{ groupId, memberId: member.id }}
                      className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
                    </span>
                  </div>
                  <ul className="divide-y divide-border/50">
                    {shown.map((r) => (
                      <li
                        key={r.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">{r.eventName}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {r.roundNumber != null ? `Round ${r.roundNumber}` : "Event total"}
                            {r.place != null && ` · ${r.place}${r.live ? " live" : ""} place`}
                            {r.live && r.thru != null && ` · thru ${r.thru}`}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-sm font-bold tabular-nums ${toParTone(r.toPar)}`}>
                            {fmtToPar(r.toPar)}
                          </div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">
                            {r.score != null
                              ? r.toPar != null
                                ? `${r.score} · Par ${r.score - r.toPar}`
                                : `${r.score} · Par unknown`
                              : "—"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {rounds.length > shown.length && (
                    <Link
                      to="/tracker/$groupId/player/$memberId"
                      params={{ groupId, memberId: member.id }}
                      className="block border-t border-border/50 px-3 py-2 text-[12px] font-medium text-primary hover:underline"
                    >
                      View all {rounds.length} rounds →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
