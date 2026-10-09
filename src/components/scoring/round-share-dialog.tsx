import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Share2, Users, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listTaggableFriends, type TaggableFriend } from "@/lib/post-tags.functions";
import { cn } from "@/lib/utils";

export type RoundShareSummary = {
  courseName: string | null;
  total: number;
  toPar: number;
  holes: number;
  rating: number | null;
  birdies: number;
  bestHole: { number: number; to_par: number } | null;
};

export type ShareVisibility = "public" | "friends";

function fmtPar(n: number) {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
}

function initials(name?: string | null) {
  return (name ?? "P")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Post-round share sheet: shows the round card the way it will land in the feed,
 * lets the player tag accepted friends (cardmates pre-selected), and pick who sees it.
 */
export function RoundShareDialog({
  open,
  onOpenChange,
  userId,
  summary,
  text,
  onTextChange,
  visibility,
  onVisibilityChange,
  selectedIds,
  onToggleId,
  suggestedIds,
  sharing,
  onShare,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  summary: RoundShareSummary | null;
  text: string;
  onTextChange: (v: string) => void;
  visibility: ShareVisibility;
  onVisibilityChange: (v: ShareVisibility) => void;
  selectedIds: string[];
  onToggleId: (id: string) => void;
  /** Cardmates from this round — surfaced first in the picker. */
  suggestedIds: string[];
  sharing: boolean;
  onShare: () => void;
  onSkip: () => void;
}) {
  const [q, setQ] = React.useState("");
  const { data: friends, isLoading } = useQuery({
    queryKey: ["taggable-friends", userId],
    enabled: !!userId && open,
    staleTime: 60_000,
    queryFn: () => listTaggableFriends(),
  });

  const list: TaggableFriend[] = React.useMemo(() => {
    const all = friends ?? [];
    const suggested = new Set(suggestedIds);
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? all.filter((f) =>
          `${f.display_name ?? ""} ${f.username ?? ""}`.toLowerCase().includes(needle),
        )
      : all;
    return [...filtered].sort((a, b) => {
      const aS = suggested.has(a.id) ? 0 : 1;
      const bS = suggested.has(b.id) ? 0 : 1;
      return aS - bS;
    });
  }, [friends, q, suggestedIds]);

  return (
    <Dialog open={open} onOpenChange={sharing ? () => {} : onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" /> Post your round
          </DialogTitle>
          <DialogDescription>
            Share the card to your feed and tag the friends you played with.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-accent/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Round recap
            </div>
            <div className="truncate text-sm font-semibold">
              {summary.courseName ?? "Your round"}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              <Stat label="Score" value={String(summary.total)} />
              <Stat label="To par" value={fmtPar(summary.toPar)} />
              <Stat label="Birdies" value={String(summary.birdies)} />
              <Stat
                label="DGD"
                value={summary.rating != null ? String(summary.rating) : "—"}
              />
            </div>
            {summary.bestHole ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Best hole: {summary.bestHole.number} ({fmtPar(summary.bestHole.to_par)}) ·{" "}
                {summary.holes} holes
              </p>
            ) : null}
          </div>
        ) : null}

        <Textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          placeholder="Say something about the round…"
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-semibold">
              <Users className="h-3.5 w-3.5" /> Tag friends
              {selectedIds.length ? (
                <span className="text-muted-foreground">· {selectedIds.length} selected</span>
              ) : null}
            </span>
            <div className="flex rounded-md border border-border p-0.5">
              {(["friends", "public"] as ShareVisibility[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onVisibilityChange(v)}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium capitalize",
                    visibility === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {v === "friends" ? "Friends only" : "Everyone"}
                </button>
              ))}
            </div>
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your friends…"
            className="mb-2 h-9"
          />
          <div className="max-h-52 overflow-auto rounded-md border border-border">
            {isLoading ? (
              <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your friends…
              </p>
            ) : list.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No friends to tag yet — add cardmates as friends and they'll show up here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((f) => {
                  const on = selectedIds.includes(f.id);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => onToggleId(f.id)}
                        className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-muted/50"
                      >
                        <Avatar className="h-7 w-7">
                          {f.avatar_url ? <AvatarImage src={f.avatar_url} /> : null}
                          <AvatarFallback>{initials(f.display_name ?? f.username)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {f.display_name ?? f.username ?? "Player"}
                          </span>
                          {suggestedIds.includes(f.id) ? (
                            <span className="text-[10px] text-primary">On your card</span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip} disabled={sharing}>
            Not now
          </Button>
          <Button onClick={onShare} disabled={sharing}>
            {sharing ? "Posting…" : "Post round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background/60 px-1 py-1.5">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
