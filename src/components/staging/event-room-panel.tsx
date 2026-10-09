import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Flag, Play, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  tournamentId: string;
  userId: string;
  startDate: string | null;
  roster: { user_id: string; display_name: string }[];
};

function useEventStaff(tournamentId: string, userId: string) {
  return useQuery({
    queryKey: ["clubhouse-staff", tournamentId, userId],
    queryFn: async () => {
      const [t, s] = await Promise.all([
        supabase.from("tournaments").select("owner_id").eq("id", tournamentId).maybeSingle(),
        supabase.from("tournament_staff").select("id").eq("tournament_id", tournamentId).eq("user_id", userId).maybeSingle(),
      ]);
      return t.data?.owner_id === userId || !!s.data;
    },
  });
}

function countdownText(target: Date, now: number) {
  const ms = target.getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

/** Event-day info for one player: staff notes, countdown, their card, and a way into scoring. */
export function EventRoomPanel({ tournamentId, userId, startDate, roster }: Props) {
  const qc = useQueryClient();
  const staff = useEventStaff(tournamentId, userId).data === true;
  const [draft, setDraft] = useState("");

  const info = useQuery({
    queryKey: ["clubhouse-event-info", tournamentId, userId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [a, rounds, cards, code] = await Promise.all([
        supabase.from("event_announcements").select("id, body, pinned, created_at").eq("tournament_id", tournamentId).order("created_at", { ascending: false }).limit(10),
        supabase.from("tournament_rounds").select("id, round_number, starts_at, shotgun_time, tee_time_start, status").eq("tournament_id", tournamentId).order("round_number"),
        supabase.from("event_card_assignments").select("id, round_id, user_id, card_label, starting_hole, tee_time").eq("tournament_id", tournamentId),
        supabase.rpc("my_event_scoring_code", { _tournament_id: tournamentId }),
      ]);
      return { ann: a.data ?? [], rounds: rounds.data ?? [], cards: cards.data ?? [], code: (code.data as string | null) ?? null };
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("event_announcements").insert({ tournament_id: tournamentId, body: draft.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ["clubhouse-event-info", tournamentId] });
    },
    onError: () => toast.error("That announcement didn't post. Only event staff can post here."),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clubhouse-event-info", tournamentId] }),
  });

  const d = info.data;
  const now = Date.now();
  const nextRound = d?.rounds.find((r) => r.status !== "complete" && r.status !== "completed") ?? d?.rounds[0];
  const startIso = nextRound?.shotgun_time ?? nextRound?.starts_at ?? nextRound?.tee_time_start ?? (startDate ? `${startDate.slice(0, 10)}T09:00:00` : null);
  const countdown = startIso ? countdownText(new Date(startIso), now) : null;
  const myCard = nextRound ? d?.cards.find((c) => c.round_id === nextRound.id && c.user_id === userId) : undefined;
  const cardmates = myCard
    ? d!.cards.filter((c) => c.round_id === myCard.round_id && c.card_label === myCard.card_label && c.user_id !== userId)
        .map((c) => roster.find((r) => r.user_id === c.user_id)?.display_name ?? "Player")
    : [];

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Event day</h2>
        {countdown ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums">
            {nextRound ? `Round ${nextRound.round_number} in ${countdown}` : `Starts in ${countdown}`}
          </span>
        ) : nextRound ? (
          <span className="text-sm text-muted-foreground">Round {nextRound.round_number} is on</span>
        ) : null}
      </div>

      <div className="rounded-lg border border-border p-2.5">
        <div className="flex items-center gap-2 text-sm">
          <Flag className="h-4 w-4 text-primary" />
          {myCard ? (
            <span>
              <span className="font-semibold">Card {myCard.card_label}</span>
              {myCard.starting_hole ? <> · starts on hole {myCard.starting_hole}</> : null}
              {myCard.tee_time ? <> · tees off {new Date(myCard.tee_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</> : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Your card and starting hole show up here once staff post them.</span>
          )}
        </div>
        {cardmates.length ? <p className="mt-1 text-sm text-muted-foreground">With {cardmates.join(", ")}</p> : null}
        <Button asChild size="sm" className="mt-2 w-full gap-1.5" disabled={!d?.code}>
          {d?.code ? (
            <Link to="/score" search={{ c: d.code }}>
              <Play className="h-4 w-4" /> Go to scoring
            </Link>
          ) : (
            <span><Play className="h-4 w-4" /> Scoring opens when staff start the round</span>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Megaphone className="h-4 w-4 text-primary" /> From the staff
        </h3>
        {d?.ann.length ? (
          <ul className="space-y-1.5">
            {d.ann.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-md bg-muted/50 p-2 text-sm">
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{a.body}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
                {staff ? (
                  <button aria-label="Remove announcement" onClick={() => remove.mutate(a.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No announcements yet. Players' meeting notes and delays show up here.</p>
        )}
        {staff ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) post.mutate(); }}>
            <Input value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder="Post to the whole field" aria-label="Post an announcement" />
            <Button type="submit" size="sm" disabled={!draft.trim() || post.isPending}>Post</Button>
          </form>
        ) : null}
      </div>

      <EventResults tournamentId={tournamentId} roster={roster} userId={userId} />

      {staff && nextRound ? <CardManager tournamentId={tournamentId} roundId={nextRound.id} roundNumber={nextRound.round_number} roster={roster} cards={d?.cards ?? []} /> : null}
    </section>
  );
}

function CardManager({
  tournamentId, roundId, roundNumber, roster, cards,
}: {
  tournamentId: string; roundId: string; roundNumber: number;
  roster: { user_id: string; display_name: string }[];
  cards: { user_id: string; round_id: string; card_label: string; starting_hole: number | null }[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const save = useMutation({
    mutationFn: async (v: { userId: string; card: string; hole: string }) => {
      const { data: reg } = await supabase.from("tournament_registrations").select("id").eq("tournament_id", tournamentId).eq("user_id", v.userId).neq("status", "withdrawn").maybeSingle();
      if (!reg) throw new Error("not registered");
      if (!v.card.trim()) {
        const { error } = await supabase.from("event_card_assignments").delete().eq("round_id", roundId).eq("registration_id", reg.id);
        if (error) throw error;
        return;
      }
      const hole = v.hole ? Number(v.hole) : null;
      const { error } = await supabase.from("event_card_assignments").upsert(
        { tournament_id: tournamentId, round_id: roundId, registration_id: reg.id, user_id: v.userId, card_label: v.card.trim(), starting_hole: hole && hole > 0 ? hole : null, updated_at: new Date().toISOString() },
        { onConflict: "round_id,registration_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clubhouse-event-info", tournamentId] }),
    onError: () => toast.error("That card didn't save."),
  });

  return (
    <div className="border-t border-border pt-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4 text-primary" /> Cards for round {roundNumber}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{open ? "Hide" : "Edit"}</span>
      </button>
      {open ? (
        roster.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No registered players yet.</p>
        ) : (
          <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
            {roster.map((p) => {
              const c = cards.find((x) => x.round_id === roundId && x.user_id === p.user_id);
              return (
                <li key={p.user_id + (c?.card_label ?? "") + (c?.starting_hole ?? "")}>
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      save.mutate({ userId: p.user_id, card: String(f.get("card") ?? ""), hole: String(f.get("hole") ?? "") });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{p.display_name}</span>
                    <Input name="card" defaultValue={c?.card_label ?? ""} placeholder="Card" aria-label={`Card for ${p.display_name}`} className="h-8 w-16" maxLength={40} />
                    <Input name="hole" type="number" min={1} max={99} defaultValue={c?.starting_hole ?? ""} placeholder="Hole" aria-label={`Starting hole for ${p.display_name}`} className="h-8 w-16" />
                    <Button type="submit" size="sm" variant="secondary" className="h-8">Save</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

/** Live standings once scores come in; final results after the event. Ties share a place. */
function EventResults({ tournamentId, roster, userId }: { tournamentId: string; roster: { user_id: string; display_name: string }[]; userId: string }) {
  const q = useQuery({
    queryKey: ["clubhouse-results", tournamentId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [t, rounds, regs, divs] = await Promise.all([
        supabase.from("tournaments").select("status").eq("id", tournamentId).maybeSingle(),
        supabase.from("tournament_rounds").select("id").eq("tournament_id", tournamentId),
        supabase.from("tournament_registrations").select("id, user_id, division_id, status").eq("tournament_id", tournamentId).neq("status", "withdrawn"),
        supabase.from("tournament_divisions").select("id, name").eq("tournament_id", tournamentId),
      ]);
      const roundIds = (rounds.data ?? []).map((r) => r.id);
      const scores = roundIds.length
        ? (await supabase.from("tournament_scores").select("registration_id, strokes, penalties").in("round_id", roundIds)).data ?? []
        : [];
      return { status: t.data?.status ?? null, regs: regs.data ?? [], divs: divs.data ?? [], scores };
    },
  });
  const d = q.data;
  if (!d || d.scores.length === 0) return null;
  const totals = new Map<string, { strokes: number; holes: number }>();
  for (const s of d.scores) {
    const t = totals.get(s.registration_id) ?? { strokes: 0, holes: 0 };
    t.strokes += s.strokes + (s.penalties ?? 0);
    t.holes += 1;
    totals.set(s.registration_id, t);
  }
  const final = d.status === "completed";
  const groups = d.divs
    .map((div) => {
      const rows = d.regs
        .filter((r) => r.division_id === div.id && totals.has(r.id))
        .map((r) => ({ userId: r.user_id, name: roster.find((x) => x.user_id === r.user_id)?.display_name ?? "Player", ...totals.get(r.id)! }))
        .sort((a, b) => a.strokes - b.strokes);
      let place = 0;
      const placed = rows.map((r, i) => {
        if (i === 0 || r.strokes !== rows[i - 1].strokes) place = i + 1;
        return { ...r, place };
      });
      return { name: div.name, rows: placed };
    })
    .filter((g) => g.rows.length);
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <h3 className="text-sm font-semibold">{final ? "Final results" : "Live standings"}</h3>
      {groups.map((g) => (
        <div key={g.name}>
          <p className="text-xs font-medium text-muted-foreground">{g.name}</p>
          <ol className="space-y-0.5">
            {g.rows.slice(0, 5).concat(g.rows.slice(5).filter((r) => r.userId === userId)).map((r) => (
              <li key={r.userId} className={"flex items-center gap-2 text-sm " + (r.userId === userId ? "font-semibold" : "")}>
                <span className="w-6 tabular-nums text-muted-foreground">{r.place}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="tabular-nums">{r.strokes}</span>
                {!final ? <span className="w-16 text-right text-xs text-muted-foreground">{r.holes} holes</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Total throws including penalties. Ties share a place.</p>
    </div>
  );
}
