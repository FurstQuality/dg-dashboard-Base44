import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Crown,
  Swords,
  Trophy,
  Flame,
  Video,
  CheckCircle2,
  XCircle,
  Upload,
  Target,
  Medal,
  Star,
  Users,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Play,
} from "lucide-react";
import {
  PageShell,
  PageHeader,
  ContentCard,
  ErrorState,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/lib/current-user";
import { friendsPageQueryOptions, type FriendProfileLite } from "@/lib/entities/friends";
import {
  ARENA_GAMES,
  gameByKey,
  arenaLeaderboardQueryOptions,
  duelsQueryOptions,
  createDuel,
  respondToDuel,
  submitProof,
  reviewProof,
  settleDuel,
  uploadProofVideo,
  proofVideoUrl,
  duelStandings,
  type ArenaDuel,
  type ArenaGame,
  type RankedLeader,
} from "@/lib/arena";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { duelDraft, hillDraft } from "@/lib/share-to-feed";

export const Route = createFileRoute("/_authenticated/arena")({
  component: ArenaPage,
  head: () => ({
    meta: [
      { title: "Arena · Friend games & King of the Hill · DG Dashboard" },
      {
        name: "description",
        content:
          "Challenge your friends to on-course and off-course disc golf games, submit video proof, and see who sits on top of the King of the Hill board.",
      },
      { property: "og:title", content: "Arena · Friend games & King of the Hill" },
      {
        property: "og:description",
        content:
          "Putting gauntlets, ace races, trick shots — video-verified duels against your crew.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function ArenaPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const leaders = useQuery(arenaLeaderboardQueryOptions(userId));
  const duels = useQuery(duelsQueryOptions(userId));
  const friends = useQuery(friendsPageQueryOptions(userId));

  const profiles = useMemo(() => friends.data?.profiles ?? {}, [friends.data]);
  const friendList = useMemo<FriendProfileLite[]>(() => {
    const rows = friends.data?.rows ?? [];
    return rows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
      .map((id) => profiles[id])
      .filter((p): p is FriendProfileLite => !!p);
  }, [friends.data, profiles, userId]);

  const myOpen = (duels.data ?? []).filter(
    (d) => d.duel.status !== "completed" && d.duel.status !== "declined",
  );

  return (
    <PageShell section="community">
      <PageHeader
        eyebrow="Play with friends"
        title="Arena"
        description="Games, duels, and bragging rights. Challenge your crew to on-course and off-course competitions, post video proof, and watch the King of the Hill board sort out who the top dog really is."
        leading={
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500">
            <Swords className="h-5 w-5" />
          </div>
        }
        secondaryAction={
          <Badge variant="secondary" className="gap-1">
            <Flame className="h-3.5 w-3.5" /> {myOpen.length} live challenge
            {myOpen.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      <Tabs defaultValue="hill">
        <TabsList className="flex-wrap">
          <TabsTrigger value="hill">
            <Crown className="mr-1 h-3.5 w-3.5" /> King of the Hill
          </TabsTrigger>
          <TabsTrigger value="games">
            <Target className="mr-1 h-3.5 w-3.5" /> Games
          </TabsTrigger>
          <TabsTrigger value="duels">
            <Swords className="mr-1 h-3.5 w-3.5" /> My duels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hill" className="mt-4">
          {leaders.isLoading ? (
            <LoadingSkeleton />
          ) : leaders.error ? (
            <ErrorState
              title="Couldn't load the hill"
              description="We couldn't pull your crew's standings just now. Try again in a moment."
            />
          ) : (
            <KingOfTheHill rows={leaders.data ?? []} />
          )}
        </TabsContent>

        <TabsContent value="games" className="mt-4">
          <GameCatalog friends={friendList} userId={userId} onCreated={() => duels.refetch()} />
        </TabsContent>

        <TabsContent value="duels" className="mt-4">
          {duels.isLoading ? (
            <LoadingSkeleton />
          ) : duels.error ? (
            <ErrorState
              title="Couldn't load your duels"
              description="Your challenges are safe — the list just didn't load. Try again in a moment."
            />
          ) : (
            <DuelList entries={duels.data ?? []} userId={userId} profiles={profiles} />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ─────────────────────────── King of the Hill ─────────────────────────── */

function KingOfTheHill({ rows }: { rows: RankedLeader[] }) {
  if (!rows.length) {
    return (
      <MascotEmptyState
        intent="social"
        title="Your hill is empty"
        description="Add a few friends and the board fills in with their ratings, badges, streaks, and duel records."
      />
    );
  }
  const top = rows[0]!;
  const me = rows.find((r) => r.is_self) ?? null;
  const max = top.crownScore || 1;

  return (
    <div className="space-y-4">
      <ContentCard
        title="Top dog"
        subtitle="The crown goes to the highest blend of verified rating, badges earned, duel wins, and streak."
      >
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-amber-500/60">
            {top.avatar_url ? <AvatarImage src={top.avatar_url} alt={top.display_name} /> : null}
            <AvatarFallback>{initials(top.display_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Crown className="h-5 w-5 text-amber-500" /> {top.display_name}
              {top.is_self ? <Badge variant="secondary">You</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {top.title} · Level {top.level} · {top.crownScore.toLocaleString()} crown points
            </p>
          </div>
          <div className="ml-auto grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat
              icon={Star}
              label="Rating"
              value={top.pdga_rating ? String(top.pdga_rating) : "—"}
            />
            <MiniStat icon={Medal} label="Badges" value={String(top.achievements)} />
            <MiniStat icon={Trophy} label="Duel wins" value={String(top.duel_wins)} />
            <MiniStat icon={Flame} label="Streak" value={`${top.streak_days}d`} />
          </div>
        </div>
      </ContentCard>

      {me ? (
        <div className="flex justify-end">
          <ShareToFeedButton
            draft={hillDraft({
              rank: me.rank,
              fieldSize: rows.length,
              crownScore: me.crownScore,
              leaderName: top.is_self ? null : top.display_name,
              isLeader: me.rank === 1,
            })}
            label="Share my rank"
            size="sm"
            variant="outline"
          />
        </div>
      ) : null}

      <ContentCard
        title="The hill"
        subtitle="Everyone in your circle, ranked. Climb by winning duels, earning badges, and keeping your streak alive."
      >
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.user_id} className="flex flex-wrap items-center gap-3 py-3">
              <span
                className={
                  "w-7 text-center text-sm font-semibold " +
                  (r.rank === 1 ? "text-amber-500" : "text-muted-foreground")
                }
              >
                {r.rank}
              </span>
              <Avatar className="h-9 w-9">
                {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.display_name} /> : null}
                <AvatarFallback>{initials(r.display_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-sm font-medium">
                  {r.display_name}
                  {r.is_self ? (
                    <Badge variant="secondary" className="h-5">
                      You
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.title} · Lv {r.level} · {r.pdga_rating ? `${r.pdga_rating} rated` : "unrated"}{" "}
                  · {r.achievements} badges · {r.duel_wins}W /{" "}
                  {Math.max(0, r.duels_played - r.duel_wins)}L
                </div>
                <Progress value={(r.crownScore / max) * 100} className="mt-1.5 h-1.5" />
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {r.crownScore.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </ContentCard>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

/* ───────────────────────────── Game catalog ───────────────────────────── */

function GameCatalog({
  friends,
  userId,
  onCreated,
}: {
  friends: FriendProfileLite[];
  userId: string | null;
  onCreated: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "on_course" | "off_course">("all");
  const [picked, setPicked] = useState<ArenaGame | null>(null);
  const games = ARENA_GAMES.filter((g) => filter === "all" || g.arena === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All games"],
            ["on_course", "On the course"],
            ["off_course", "Off the course"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <ContentCard key={g.key} title={g.title} subtitle={g.blurb}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {g.arena === "on_course" ? "On course" : "Off course"}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> {g.duration}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Flame className="h-3 w-3" /> {g.defaultStake} XP
                </Badge>
                {g.requiresVideo ? (
                  <Badge className="gap-1 bg-rose-500/15 text-rose-500 hover:bg-rose-500/15">
                    <Video className="h-3 w-3" /> Video proof
                  </Badge>
                ) : null}
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{g.rules}</p>
              <p className="text-[13px]">
                <span className="text-muted-foreground">Scored on:</span> {g.metric} ·{" "}
                {g.direction === "low_wins" ? "lowest wins" : "highest wins"}
              </p>
              <Button className="w-full" onClick={() => setPicked(g)}>
                <Swords className="mr-1.5 h-4 w-4" /> Challenge a friend
              </Button>
            </div>
          </ContentCard>
        ))}
      </div>

      <ChallengeDialog
        game={picked}
        friends={friends}
        userId={userId}
        onClose={() => setPicked(null)}
        onCreated={onCreated}
      />
    </div>
  );
}

function ChallengeDialog({
  game,
  friends,
  userId,
  onClose,
  onCreated,
}: {
  game: ArenaGame | null;
  friends: FriendProfileLite[];
  userId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [stake, setStake] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = async () => {
    if (!game || !userId) return;
    if (!selected.length) {
      toast.error("Pick at least one friend to challenge");
      return;
    }
    setSaving(true);
    try {
      await createDuel({
        game,
        createdBy: userId,
        opponentIds: selected,
        stake: Number(stake) || game.defaultStake,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      toast.success("Challenge sent — the gauntlet is down");
      setSelected([]);
      setStake("");
      setDueAt("");
      await qc.invalidateQueries({ queryKey: ["arena-duels", userId] });
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that challenge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!game} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{game?.title ?? "Challenge"}</DialogTitle>
          <DialogDescription>{game?.rules}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Who are you calling out?</Label>
            {friends.length ? (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border/60 p-1.5">
                {friends.map((f) => {
                  const on = selected.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggle(f.id)}
                      className={
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors " +
                        (on ? "bg-primary/10 text-primary" : "hover:bg-muted")
                      }
                    >
                      <Avatar className="h-7 w-7">
                        {f.avatar_url ? (
                          <AvatarImage src={f.avatar_url} alt={f.display_name} />
                        ) : null}
                        <AvatarFallback>{initials(f.display_name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate">{f.display_name}</span>
                      {f.pdga_rating ? (
                        <span className="text-xs text-muted-foreground">{f.pdga_rating}</span>
                      ) : null}
                      {on ? <CheckCircle2 className="h-4 w-4" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add friends first and they'll show up here to challenge.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="stake">XP on the line</Label>
              <Input
                id="stake"
                type="number"
                min={5}
                max={500}
                placeholder={String(game?.defaultStake ?? 25)}
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">Settle by</Label>
              <Input
                id="due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>

          {game?.requiresVideo ? (
            <p className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-500">
              <Video className="mt-0.5 h-4 w-4 shrink-0" />
              Video proof required. Both players upload a clip and the opponent verifies it before
              the win counts.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={saving}>
            {saving ? "Sending…" : "Send challenge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────── Duels ──────────────────────────────── */

function DuelList({
  entries,
  userId,
  profiles,
}: {
  entries: ArenaDuel[];
  userId: string | null;
  profiles: Record<string, FriendProfileLite>;
}) {
  if (!entries.length) {
    return (
      <MascotEmptyState
        intent="athletic"
        title="No challenges yet"
        description="Head to Games, pick something fun, and call out a friend. Putting gauntlets are a good place to start."
      />
    );
  }
  const live = entries.filter((e) => e.duel.status !== "completed" && e.duel.status !== "declined");
  const done = entries.filter((e) => e.duel.status === "completed" || e.duel.status === "declined");

  return (
    <div className="space-y-4">
      {live.map((e) => (
        <DuelCard key={e.duel.id} entry={e} userId={userId} profiles={profiles} />
      ))}
      {done.length ? (
        <ContentCard title="Settled" subtitle="Finished and declined challenges.">
          <ul className="divide-y divide-border/60">
            {done.map((e) => (
              <li key={e.duel.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Trophy
                  className={
                    "h-4 w-4 " +
                    (e.duel.winner_id === userId ? "text-amber-500" : "text-muted-foreground")
                  }
                />
                <span className="font-medium">{e.duel.title}</span>
                <span className="text-muted-foreground">
                  {e.duel.status === "declined"
                    ? "Declined"
                    : e.duel.winner_id
                      ? `Won by ${nameOf(e.duel.winner_id, userId, profiles)}`
                      : "Closed without a winner"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.duel.created_at).toLocaleDateString()}
                </span>
                {e.duel.status === "completed" ? (
                  <ShareToFeedButton
                    variant="ghost"
                    size="icon"
                    iconOnly
                    label="Share this result"
                    title="Share this battle"
                    draft={() =>
                      duelDraft({
                        title: e.duel.title,
                        arena: e.duel.arena,
                        won: e.duel.winner_id === userId,
                        wagerXp: e.duel.wager_xp,
                      })
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </ContentCard>
      ) : null}
    </div>
  );
}

function DuelCard({
  entry,
  userId,
  profiles,
}: {
  entry: ArenaDuel;
  userId: string | null;
  profiles: Record<string, FriendProfileLite>;
}) {
  const qc = useQueryClient();
  const { duel, participants, submissions } = entry;
  const game = gameByKey(duel.game_key);
  const me = participants.find((p) => p.user_id === userId);
  const invited = me?.invite_status === "invited";
  const mySub = submissions.find((s) => s.user_id === userId);
  const standings = duelStandings(entry);
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["arena-duels", userId] });

  const respond = async (accept: boolean) => {
    if (!userId) return;
    setBusy(true);
    try {
      await respondToDuel(duel.id, userId, accept);
      toast.success(accept ? "Challenge accepted — good luck" : "Challenge declined");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that challenge");
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!userId) return;
    if (duel.requires_video && !file) {
      toast.error("This game needs a video clip as proof");
      return;
    }
    setBusy(true);
    try {
      let path: string | null = null;
      if (file) path = await uploadProofVideo(userId, file);
      await submitProof({
        duelId: duel.id,
        userId,
        score: score === "" ? null : Number(score),
        notes,
        videoPath: path,
        videoUrl: null,
      });
      toast.success("Proof posted — your opponent reviews next");
      setScore("");
      setNotes("");
      setFile(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post your proof");
    } finally {
      setBusy(false);
    }
  };

  const review = async (submissionId: string, verified: boolean) => {
    if (!userId) return;
    setBusy(true);
    try {
      await reviewProof({ submissionId, reviewerId: userId, verified });
      toast.success(verified ? "Verified" : "Flagged for a rematch look");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that review");
    } finally {
      setBusy(false);
    }
  };

  const settle = async (winnerId: string) => {
    setBusy(true);
    try {
      await settleDuel(duel.id, winnerId);
      toast.success("Winner locked in — XP awarded");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't settle that duel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentCard
      title={duel.title}
      subtitle={`${game?.metric ?? duel.target_metric ?? "Score"} · ${game?.direction === "low_wins" ? "lowest wins" : "highest wins"} · ${duel.wager_xp} XP on the line`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{statusLabel(duel.status)}</Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" /> {participants.length} players
          </Badge>
          {duel.requires_video ? (
            <Badge className="gap-1 bg-rose-500/15 text-rose-500 hover:bg-rose-500/15">
              <Video className="h-3 w-3" /> Video proof
            </Badge>
          ) : null}
          {duel.due_at ? (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" /> by {new Date(duel.due_at).toLocaleDateString()}
            </Badge>
          ) : null}
        </div>

        <ul className="space-y-1.5">
          {standings.map((s, i) => (
            <li
              key={s.userId}
              className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-sm"
            >
              <span className="w-5 text-center text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{nameOf(s.userId, userId, profiles)}</span>
              {s.verified ? (
                <ShieldCheck
                  aria-label="Verified by opponent"
                  className="h-4 w-4 text-emerald-500"
                />
              ) : null}
              <span className="tabular-nums">{s.score ?? "—"}</span>
            </li>
          ))}
        </ul>

        {invited ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => respond(true)} disabled={busy}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Accept challenge
            </Button>
            <Button variant="outline" onClick={() => respond(false)} disabled={busy}>
              <XCircle className="mr-1.5 h-4 w-4" /> Decline
            </Button>
          </div>
        ) : null}

        {!invited && !mySub ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <p className="text-sm font-medium">Post your result</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`score-${duel.id}`}>{game?.metric ?? "Score"}</Label>
                <Input
                  id={`score-${duel.id}`}
                  type="number"
                  step="0.1"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`clip-${duel.id}`}>
                  Proof clip {duel.requires_video ? "(required)" : "(optional)"}
                </Label>
                <Input
                  id={`clip-${duel.id}`}
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <Textarea
              placeholder="How did it go? Conditions, discs, the shot that saved you…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
            <Button onClick={post} disabled={busy}>
              <Upload className="mr-1.5 h-4 w-4" /> {busy ? "Posting…" : "Submit result"}
            </Button>
          </div>
        ) : null}

        {submissions.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Proof log</p>
            {submissions.map((s) => (
              <SubmissionRow
                key={s.id}
                name={nameOf(s.user_id, userId, profiles)}
                score={s.score}
                notes={s.notes}
                status={s.status}
                videoPath={s.video_path}
                canReview={!!userId && s.user_id !== userId}
                busy={busy}
                onReview={(ok) => review(s.id, ok)}
              />
            ))}
          </div>
        ) : null}

        {duel.status !== "completed" && participants.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="text-sm text-muted-foreground">Settle it:</span>
            <Select onValueChange={(v) => settle(v)}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Declare the winner" />
              </SelectTrigger>
              <SelectContent>
                {participants
                  .filter((p) => p.invite_status !== "declined")
                  .map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {nameOf(p.user_id, userId, profiles)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </ContentCard>
  );
}

function SubmissionRow({
  name,
  score,
  notes,
  status,
  videoPath,
  canReview,
  busy,
  onReview,
}: {
  name: string;
  score: number | null;
  notes: string | null;
  status: string;
  videoPath: string | null;
  canReview: boolean;
  busy: boolean;
  onReview: (verified: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const watch = async () => {
    if (!videoPath) return;
    const signed = await proofVideoUrl(videoPath);
    if (!signed) {
      toast.error("That clip couldn't be opened");
      return;
    }
    setUrl(signed);
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        <span className="tabular-nums text-muted-foreground">{score ?? "—"}</span>
        {status === "verified" ? (
          <Badge className="gap-1 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15">
            <ShieldCheck className="h-3 w-3" /> Verified
          </Badge>
        ) : status === "disputed" ? (
          <Badge className="gap-1 bg-amber-500/15 text-amber-500 hover:bg-amber-500/15">
            <AlertTriangle className="h-3 w-3" /> Questioned
          </Badge>
        ) : (
          <Badge variant="outline">Awaiting review</Badge>
        )}
        {videoPath ? (
          <Button size="sm" variant="outline" onClick={watch}>
            <Play className="mr-1 h-3.5 w-3.5" /> Watch clip
          </Button>
        ) : null}
      </div>
      {notes ? <p className="text-[13px] text-muted-foreground">{notes}</p> : null}
      {url ? (
        <video src={url} controls className="w-full rounded-lg border border-border/60" />
      ) : null}
      {canReview && status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onReview(true)} disabled={busy}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Verify
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReview(false)} disabled={busy}>
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Question it
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "DG"
  );
}

function nameOf(
  id: string,
  userId: string | null,
  profiles: Record<string, FriendProfileLite>,
): string {
  if (id === userId) return "You";
  return profiles[id]?.display_name ?? "Player";
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Waiting on acceptance";
    case "active":
      return "In progress";
    case "awaiting_review":
      return "Proof under review";
    case "completed":
      return "Settled";
    case "declined":
      return "Declined";
    default:
      return status;
  }
}
