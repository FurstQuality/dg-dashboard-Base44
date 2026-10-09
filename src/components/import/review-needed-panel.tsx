import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Trash2, EyeOff, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  listMyImports,
  patchImportedRound,
  deleteImportedRound,
} from "@/lib/import-rounds.functions";

type Row = Awaited<ReturnType<typeof listMyImports>>[number];

/**
 * Surfaces rounds that were imported but are missing the data DG Dashboard needs
 * to count them in ratings and stats (score or round rating). One-click fixes:
 * fill in the missing number, exclude the round, or delete it entirely.
 */
export function ReviewNeededPanel() {
  const patchFn = useServerFn(patchImportedRound);
  const deleteFn = useServerFn(deleteImportedRound);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["needs-review", "rounds"],
    queryFn: () => listMyImports(),
    staleTime: 30_000,
  });

  // UDisc exports never carry an official round rating, so a missing rating is
  // expected there and is not something a player can fix. Those rounds are done
  // as soon as they have a real score; only PDGA/manual rounds need a rating.
  const needing = useMemo(() => {
    return (q.data ?? []).filter((r) => {
      if (r.included === false) return false;
      const noScore = r.score == null || r.score <= 0;
      const needsRating = r.source !== "udisc" && r.round_rating == null;
      return noScore || needsRating;
    });
  }, [q.data]);


  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["needs-review"] });
    qc.invalidateQueries({ queryKey: ["settings-imports"] });
  };

  if (q.isLoading) return null;
  if (needing.length === 0) return null;

  const preview = open ? needing : needing.slice(0, 3);

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <div className="rounded-lg bg-amber-500/15 p-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Rounds needing review</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {needing.length}
            </Badge>
          </div>
          <CardDescription className="mt-1">
            These rounds are missing a score or an official rating, so they can't count in your
            stats or rating yet. Fill in what you know, exclude the round, or delete it.
          </CardDescription>
        </div>
        {needing.length > 3 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" /> Show all
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {preview.map((r) => (
          <ReviewRow
            key={r.id}
            row={r}
            onSave={async (patch) => {
              try {
                await patchFn({ data: { id: r.id, ...patch } });
                toast.success("Round updated");
                refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Save failed");
              }
            }}
            onExclude={async () => {
              try {
                await patchFn({ data: { id: r.id, included: false } });
                toast.success("Round excluded from rating");
                refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Update failed");
              }
            }}
            onDelete={async () => {
              try {
                await deleteFn({ data: { id: r.id } });
                toast.success("Round deleted");
                refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Delete failed");
              }
            }}
          />
        ))}
        {!open && needing.length > 3 && (
          <p className="pt-1 text-[11px] text-muted-foreground">
            +{needing.length - 3} more waiting for review.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewRow({
  row,
  onSave,
  onExclude,
  onDelete,
}: {
  row: Row;
  onSave: (p: { score?: number | null; round_rating?: number | null }) => Promise<void>;
  onExclude: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [score, setScore] = useState<string>(row.score?.toString() ?? "");
  const [rating, setRating] = useState<string>(row.round_rating?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  const missing: string[] = [];
  if (row.score == null || row.score <= 0) missing.push("score");
  if (row.source !== "udisc" && row.round_rating == null) missing.push("rating");


  const label = row.event_name?.trim() || row.course_name || "Round";
  const played = row.played_on
    ? new Date(row.played_on).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.course_name}
            {row.layout_name ? ` · ${row.layout_name}` : ""} · {played}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px] uppercase">
            {row.source}
          </Badge>
          {missing.map((m) => (
            <Badge
              key={m}
              variant="outline"
              className="border-amber-500/40 text-[10px] uppercase text-amber-700 dark:text-amber-300"
            >
              Missing {m}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="flex items-center gap-2 text-xs">
          <span className="w-14 text-muted-foreground">Score</span>
          <Input
            type="number"
            inputMode="numeric"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="—"
            className="h-8"
          />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-14 text-muted-foreground">Rating</span>
          <Input
            type="number"
            inputMode="numeric"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            placeholder="—"
            className="h-8"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(() =>
                onSave({
                  score: score.trim() === "" ? null : Number(score),
                  round_rating: rating.trim() === "" ? null : Number(rating),
                }),
              )
            }
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(onExclude)}>
            <EyeOff className="mr-1 h-3.5 w-3.5" /> Exclude
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-600 hover:text-rose-700"
            disabled={busy}
            onClick={() => run(onDelete)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
