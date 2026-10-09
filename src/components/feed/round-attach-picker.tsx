import { useEffect, useState } from "react";
import { Loader2, Target, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export type AttachedRound = {
  id: string;
  courseName: string;
  playedOn: string;
  score: number | null;
  toPar: number | null;
  rating: number | null;
  eventName: string | null;
};

/** Lets a player attach one of their recent scored rounds to a post. */
export function RoundAttachPicker({
  userId,
  value,
  onChange,
}: {
  userId: string;
  value: AttachedRound | null;
  onChange: (round: AttachedRound | null) => void;
}) {
  const [rounds, setRounds] = useState<AttachedRound[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("external_rounds")
      .select("id, course_name, played_on, score, to_par, round_rating, event_name")
      .eq("user_id", userId)
      .order("played_on", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!active) return;
        setRounds(
          (data ?? []).map((r) => ({
            id: r.id,
            courseName: r.course_name,
            playedOn: r.played_on,
            score: r.score,
            toPar: r.to_par,
            rating: r.round_rating,
            eventName: r.event_name,
          })),
        );
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <Target className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-medium text-foreground">{value.courseName}</p>
          <p className="truncate text-muted-foreground">{formatRoundLine(value)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Remove attached round</span>
        </Button>
      </div>
    );
  }

  if (rounds === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pulling up your recent rounds…
      </p>
    );
  }

  if (rounds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No scored rounds yet — play or import a round and it'll show up here to attach.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {rounds.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onChange(r)}
          className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground/80 transition hover:border-primary hover:text-foreground"
        >
          {r.courseName} · {formatRoundLine(r)}
        </button>
      ))}
    </div>
  );
}

export function formatRoundLine(r: AttachedRound): string {
  const parts: string[] = [];
  if (r.toPar !== null) parts.push(r.toPar > 0 ? `+${r.toPar}` : `${r.toPar}`);
  else if (r.score !== null) parts.push(String(r.score));
  if (r.rating !== null) parts.push(`${r.rating} rated`);
  parts.push(new Date(`${r.playedOn}T12:00:00`).toLocaleDateString());
  if (r.eventName) parts.push(r.eventName);
  return parts.join(" · ");
}
