import { formatToPar } from "@/lib/score-display";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoundRatingPair } from "@/components/round-rating-pair";
import { RoundSourcePill } from "@/components/round-source-pill";
import { useSession, timeAgo } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import {
  Play,
  MapPin,
  Trophy,
  ClipboardList,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  BarChart3,
  BookOpen,
  Pencil,
  Trash2,
  Loader2,
  MessageCircle,
  Users,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRoundHistory,
  type NativeRoundRow,
  type ExternalRoundRow,
  type FriendActiveRoundRow,
  type RoundHistoryResult,
} from "@/lib/round-history.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { ScoringBreakdown } from "@/components/scoring-breakdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";

import { PlayCrewPanel } from "@/components/play/play-crew-panel";
import { RoundPostShareButton } from "@/components/scoring/round-post-share-button";
import { roundDraft, resultDraft } from "@/lib/share-to-feed";
import { PlayRowsSkeleton } from "@/components/play/play-widget-states";
import { openDgimDirect } from "@/lib/dgim";
import { formatRoundPlayLine, roundContextLabel, teamSizeLabel } from "@/lib/competition-model";

/** "Thu, Sep 10 · 4:12 PM" — the calendar date a round was started on. */
function startedLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Date unknown";
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

type NativeRow = NativeRoundRow;

type ExternalRow = ExternalRoundRow;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function formatPlannedDate(startsOn: string | null, startsAt: string | null): string {
  const iso = startsAt ?? startsOn;
  if (!iso) return "Date TBD";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "Date TBD";
  const dateStr = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (startsAt) {
    const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${dateStr} · ${timeStr}`;
  }
  return dateStr;
}

type FriendRoundRow = FriendActiveRoundRow;

/**
 * Rounds panel embedded in the Play overview: rounds in progress,
 * friends on the course right now, and the player's round history
 * across DG Dashboard, PDGA, and UDisc.
 */
export function PlayRoundsPanel() {
  const { user } = useSession();

  const roundHistoryFn = useServerFn(getRoundHistory);
  // This panel only shows who's on a course right now, so it no longer pulls the
  // player's whole DG Dashboard / PDGA / UDisc round history to render.
  const { data: history } = useQuery({
    queryKey: ["play-overview", "crew", user?.id ?? null],
    queryFn: () =>
      roundHistoryFn({
        data: { nativeLimit: 1, externalLimit: 1, includeFriends: true, includePlanned: false },
      }),
    enabled: !!user,
    staleTime: STATS_STALE.rounds,
  });

  const friendsActive: FriendRoundRow[] | null = history?.friendsActive ?? null;

  return (
    <div className="space-y-6">
      {/* FRIENDS PLAYING + OPEN ROUNDS, SIDE BY SIDE */}
      <PlayCrewPanel friendsActive={friendsActive} />
    </div>
  );
}

/**
 * A friend's live round. Beyond the score-in-progress detail, this card is a
 * jumping-off point: open their profile or start a chat about the round.
 */
function FriendLiveRoundCard({
  r,
  viewerId,
}: {
  r: FriendRoundRow;
  viewerId: string | null | undefined;
}) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);

  async function handleMessage() {
    if (!viewerId) return;
    setOpening(true);
    try {
      const conversationId = await openDgimDirect(viewerId, r.created_by);
      await navigate({ to: "/dgim", search: { conv: conversationId } });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't open that chat. Give it another shot.",
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-sky-500/60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-500">
          {r.player_name} · live
        </span>
      </div>
      <div className="mt-1 truncate font-display text-base font-semibold">
        {r.course_name ?? "Course"}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        <span className="truncate">
          {[r.city, r.state].filter(Boolean).join(", ") || "Unknown"}
        </span>
        <span>·</span>
        <span>Started {timeAgo(r.started_at)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleMessage()}
          disabled={!viewerId || opening}
        >
          {opening ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
          )}
          Message
        </Button>
        {r.player_username ? (
          <Button asChild size="sm" variant="ghost">
            <Link to="/players/$username" params={{ username: r.player_username }}>
              View profile
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ActiveRoundCard({
  r,
  onDeleted,
  onUpdated,
  compact = false,
}: {
  r: NativeRow;
  compact?: boolean;
  onDeleted: (id: string) => void;
  onUpdated: (id: string, patch: Partial<NativeRow>) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(r.status);
  const [startedLocal, setStartedLocal] = useState<string>(() => {
    const d = new Date(r.started_at);
    // datetime-local expects "YYYY-MM-DDTHH:mm"
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  async function handleSave() {
    setBusy(true);
    try {
      const iso = new Date(startedLocal).toISOString();
      const patch: {
        status: "in_progress" | "completed" | "abandoned";
        started_at: string;
        ended_at?: string | null;
      } = { status: status as "in_progress" | "completed" | "abandoned", started_at: iso };
      if (status !== "in_progress" && !r.ended_at) patch.ended_at = new Date().toISOString();
      if (status === "in_progress") patch.ended_at = null;
      const { error } = await supabase.from("rounds").update(patch).eq("id", r.id);
      if (error) throw error;
      onUpdated(r.id, {
        status,
        started_at: iso,
        ended_at: (patch.ended_at as string | null) ?? r.ended_at,
      });
      toast.success("Round updated");
      setEditOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't save this round. Give it another shot.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      // One database routine removes scores, players and the round together.
      const { error } = await supabase.rpc("delete_round", { _round_id: r.id });
      if (error) throw error;

      onDeleted(r.id);
      toast.success("Round deleted");
      setDeleteOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't delete this round. Give it another shot.",
      );
    } finally {
      setBusy(false);
    }
  }

  const dialogs = (
    <>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit round</DialogTitle>
            <DialogDescription>Update the status or start time for this round.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`status-${r.id}`}>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id={`status-${r.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="abandoned">Abandoned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`started-${r.id}`}>Started at</Label>
              <Input
                id={`started-${r.id}`}
                type="datetime-local"
                value={startedLocal}
                onChange={(e) => setStartedLocal(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this round?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the round, its players, and all scores. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (compact) {
    const holes = r.holes_total
      ? `${r.holes_scored}/${r.holes_total} holes`
      : `${r.holes_scored} holes`;
    return (
      <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {r.course?.name ?? "Course"}
            {r.layout_name ? (
              <span className="font-normal text-muted-foreground"> · {r.layout_name}</span>
            ) : null}
          </div>
          <div className="truncate text-[13px] text-muted-foreground">
            In progress · {holes} · {formatToPar(r.toPar)}
            {r.cardmates.length ? ` · with ${r.cardmates.map((m) => m.name).join(", ")}` : " · solo"}
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditOpen(true)} aria-label="Edit round">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete round"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button asChild size="sm">
          <Link to="/play/$roundId" params={{ roundId: r.id }}>
            <Play className="h-3.5 w-3.5" />
            <span className="ml-1">Resume</span>
          </Link>
        </Button>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 transition hover:border-primary hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              In progress
            </span>
          </div>
          <div className="mt-1 truncate font-display text-lg font-semibold">
            {r.course?.name ?? "Course"}
            {r.layout_name ? (
              <span className="font-sans text-sm font-normal text-muted-foreground">
                {" "}
                · {r.layout_name}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {[r.course?.city, r.course?.state].filter(Boolean).join(", ") || "Unknown"}
            </span>
            <span>·</span>
            <span>{startedLabel(r.started_at)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className={"font-display text-2xl font-bold tabular-nums " + (r.toPar == null ? "text-muted-foreground" : r.toPar < 0 ? "text-primary" : r.toPar > 0 ? "text-destructive" : "")}>
            {formatToPar(r.toPar)}
          </div>
          <div className="text-[13px] tabular-nums text-muted-foreground">
            {r.total ?? 0} strokes{r.toPar != null && r.total ? ` · Par ${r.total - r.toPar}` : ""}
          </div>
          {r.holes_total ? (
            <div className="text-sm text-muted-foreground">
              {r.holes_scored} of {r.holes_total} holes
            </div>
          ) : r.holes_scored ? (
            <div className="text-sm text-muted-foreground">{r.holes_scored} holes scored</div>
          ) : null}
        </div>
      </div>

      {/* Holes scored so far — a quick read on how much of the card is filled in. */}
      {r.holes_total ? (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={r.holes_scored}
            aria-valuemin={0}
            aria-valuemax={r.holes_total}
            aria-label="Holes scored"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, Math.round((r.holes_scored / r.holes_total) * 100))}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">
          {roundContextLabel(r.round_context)}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-0.5">
          {formatRoundPlayLine({
            play_format: r.play_format,
            team_throw_style: null,
            scoring_type: r.scoring_type,
          })}
        </span>
        {r.play_format === "teams" && r.team_size ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5">{teamSizeLabel(r.team_size)}</span>
        ) : null}
        {r.is_rated ? (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-medium text-primary">
            DGD rated
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
        <Users className="mt-0.5 h-4 w-4 shrink-0" />
        {r.cardmates.length === 0 ? (
          <span>Playing solo — add cardmates when you resume.</span>
        ) : (
          <span className="min-w-0">
            With{" "}
            {r.cardmates.map((m, i) => (
              <span key={`${m.name}-${i}`}>
                {i > 0 ? ", " : ""}
                {m.username ? (
                  <Link
                    to="/players/$username"
                    params={{ username: m.username }}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {m.name}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{m.name}</span>
                )}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditOpen(true)}
          aria-label="Edit round"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="ml-1 hidden sm:inline">Edit</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete round"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="ml-1 hidden sm:inline">Delete</span>
        </Button>
        <Button asChild size="sm">
          <Link to="/play/$roundId" params={{ roundId: r.id }}>
            <Play className="h-3.5 w-3.5" />
            <span className="ml-1">Resume</span>
          </Link>
        </Button>
      </div>

      {dialogs}
    </div>
  );
}

function ExternalList({ rows, emptyText }: { rows: ExternalRow[] | null; emptyText: string }) {
  if (rows === null)
    return <div className="text-sm text-muted-foreground">Pulling PDGA round history…</div>;
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="no-scrollbar max-h-[270px] divide-y divide-border overflow-y-auto">
        {rows.slice(0, 200).map((r) => {
          const toPar = r.to_par ?? null;
          return (
            <div key={r.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <RoundSourcePill source={r.source} compact />
                  <div className="truncate font-semibold">
                    {r.course_name ?? "Unknown course"}
                    {r.layout_name ? (
                      <span className="text-muted-foreground"> · {r.layout_name}</span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {r.event_name ? (
                    <span className="truncate max-w-[40ch]">{r.event_name}</span>
                  ) : null}
                  <span>{new Date(r.played_on).toLocaleDateString()}</span>
                  {r.place != null ? (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase " +
                        (r.place === 1
                          ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300"
                          : r.place === 2
                            ? "bg-slate-400/25 text-slate-700 dark:text-slate-200"
                            : r.place === 3
                              ? "bg-amber-700/20 text-amber-800 dark:text-amber-300"
                              : "bg-muted text-foreground/80")
                      }
                      title={r.points != null ? `${r.points} PDGA points` : "Finishing position"}
                    >
                      {ordinal(r.place)}
                    </span>
                  ) : null}
                  {r.format && r.format !== "singles" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                      {r.format}
                    </span>
                  ) : null}
                  {r.division ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                      {r.division}
                    </span>
                  ) : null}
                  {r.included === false ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      excluded
                    </span>
                  ) : null}
                </div>
              </div>
              <ShareToFeedButton
                variant="ghost"
                size="icon"
                iconOnly
                label="Share this round"
                title="Share this round"
                draft={() =>
                  r.place != null && r.event_name
                    ? resultDraft({
                        eventName: r.event_name,
                        division: r.division,
                        place: r.place,
                        toPar: r.to_par,
                        courseName: r.course_name,
                      })
                    : roundDraft(r)
                }
              />
              <div className="text-right">
                <RoundRatingPair
                  source={r.source}
                  publishedRating={r.round_rating}
                  roundId={r.id}
                />

                <div className={"text-base font-bold tabular-nums " + (toPar == null ? "text-muted-foreground" : toPar < 0 ? "text-primary" : toPar > 0 ? "text-destructive" : "")}>
                  {formatToPar(toPar)}
                </div>
                <div className="text-[13px] tabular-nums text-muted-foreground">
                  {r.score ?? "—"} · {r.score != null && toPar != null ? `Par ${r.score - toPar}` : "Par unknown"}
                </div>
              </div>
            </div>
          );
        })}
        {rows.length > 200 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Showing 200 of {rows.length} rounds.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NativeList({ rows, userId }: { rows: NativeRow[] | null; userId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows === null)
    return <div className="text-sm text-muted-foreground">Loading your DG rounds…</div>;
  const finished = rows.filter((r) => r.status !== "in_progress");
  if (finished.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <h3 className="font-display text-lg font-semibold">No completed DG rounds yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Finish a scored round in the app and it will appear here.
        </p>
        <Button asChild className="mt-4">
          <Link to="/play/pick-course">
            <Play className="mr-1 h-4 w-4" />
            Pick a course
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="no-scrollbar max-h-[270px] divide-y divide-border overflow-y-auto">
        {finished.map((r) => (
          <RowInner
            key={r.id}
            r={r}
            isOpen={openId === r.id}
            onToggle={() => setOpenId(openId === r.id ? null : r.id)}
            userId={userId}
          />
        ))}
      </div>
    </div>
  );
}

function RowInner({
  r,
  isOpen,
  onToggle,
  userId,
}: {
  r: NativeRow;
  isOpen: boolean;
  onToggle: () => void;
  userId: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onToggle}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-muted"
          aria-label={isOpen ? "Hide breakdown" : "Show breakdown"}
          title={isOpen ? "Hide breakdown" : "Show scoring breakdown"}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Link
          to="/play/$roundId"
          params={{ roundId: r.id }}
          className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80"
        >
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{r.course?.name ?? "Course"}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {[r.course?.city, r.course?.state].filter(Boolean).join(", ") || "Unknown"}
              <span>·</span>
              <span>{timeAgo(r.started_at)}</span>
              <span>·</span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[10px] uppercase " +
                  (r.status === "in_progress" ? "bg-primary/15 text-primary" : "bg-muted")
                }
              >
                {r.status.replace("_", " ")}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className={"font-display text-xl font-bold tabular-nums " + (r.toPar == null ? "text-muted-foreground" : r.toPar < 0 ? "text-primary" : r.toPar > 0 ? "text-destructive" : "")}>
              {formatToPar(r.toPar)}
            </div>
            <div className="text-[13px] tabular-nums text-muted-foreground">
              {r.total ?? 0}{r.toPar != null && r.total ? ` · Par ${r.total - r.toPar}` : ""}
            </div>
          </div>
        </Link>
        {userId ? (
          <RoundPostShareButton
            roundId={r.id}
            layoutId={r.layout_id}
            userId={userId}
            courseName={r.course?.name ?? null}
            className="shrink-0"
          />
        ) : null}
      </div>
      {isOpen && userId ? (
        <div className="border-t border-border bg-muted/20 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" /> Round breakdown
          </div>
          <ScoringBreakdown roundId={r.id} userId={userId} layoutId={r.layout_id} />
        </div>
      ) : null}
    </div>
  );
}
