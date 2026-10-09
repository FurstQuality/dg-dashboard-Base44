import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { takePendingRoundType } from "@/lib/round-type";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import QRCode from "qrcode";
import {
  ArrowDown,
  ArrowUp,
  Play,
  Trash2,
  UserPlus,
  Users,
  Loader2,
  Flag,
  Trophy,
  Coffee,
  AlertTriangle,
  QrCode,
  Copy,
  Share2,
  MessageSquare,
  NotebookPen,
  Layers,
  CalendarDays,
  Swords,
} from "lucide-react";
import { toast } from "sonner";
import { RatedRoundRulesSheet } from "@/components/rated-round-rules-sheet";
import { meetsSanctionedThreshold, requiredScorerCount } from "@/lib/dgd-rated-rules";
import { ensureRoundJoinCode } from "@/lib/guest-scoring.functions";
import {
  DEFAULT_IMPOSTER_SETTINGS,
  DEFAULT_WOLF_SETTINGS,
  ROUND_CONTEXT_OPTIONS,
  ROUND_GAME_MODES,
  TEAM_SIZE_OPTIONS,
  TEAM_THROW_STYLE_OPTIONS,
  gameMode,
  gameModeFitsCard,
  isCasualGameScoringType,
  playFormatForTeamSize,
  scoringTypeLabel,
  teamSizeLabel,
  type GameModeId,
  type ImposterSettings,
  type PlayFormat,
  type RoundContext,
  type ScoringType,
  type TeamThrowStyle,
  type WolfSettings,
} from "@/lib/competition-model";
import { GameRulesSheet } from "@/components/play/game-rules-sheet";
import { rulebookEntry } from "@/lib/game-rulebook";
import { loadPlayerLayoutOrder } from "@/lib/layout-activity";

type FriendProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type PlayerDraft =
  | { key: string; kind: "self"; user_id: string; name: string }
  | { key: string; kind: "friend"; user_id: string; name: string; avatar_url: string | null }
  | { key: string; kind: "guest"; name: string };

const ROUND_CONTEXTS = ROUND_CONTEXT_OPTIONS.filter(
  (o) =>
    o.value === "casual" ||
    o.value === "practice" ||
    o.value === "league_night" ||
    o.value === "side_event",
);

type LayoutOption = {
  id: string;
  name: string;
  hole_count: number;
  par_total: number | null;
  is_default: boolean;
};

export function StartRoundDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
  layoutId,
  holeCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  courseId: string;
  courseName: string;
  layoutId: string | null;
  holeCount: number;
}) {
  const { user } = useSession();
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [recent, setRecent] = useState<FriendProfile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [players, setPlayers] = useState<PlayerDraft[]>([]);
  const [guestName, setGuestName] = useState("");
  const [startingHole, setStartingHole] = useState(1);
  const [starting, setStarting] = useState(false);
  const [search, setSearch] = useState("");
  const [ratingMode, setRatingMode] = useState<"dgd_rated" | "casual">("dgd_rated");
  const [gameModeId, setGameModeId] = useState<GameModeId>("singles_stroke");
  const [roundContext, setRoundContext] = useState<RoundContext>("casual");
  const [throwStyle, setThrowStyle] = useState<TeamThrowStyle>("best_throw");
  const [teamSize, setTeamSize] = useState(2);
  const [useHandicap, setUseHandicap] = useState(false);

  // The picked game decides the stored format and scoring; team size decides
  // whether that format is recorded as doubles or larger teams.
  const selectedMode = gameMode(gameModeId);
  const playFormat: PlayFormat = selectedMode.teams
    ? playFormatForTeamSize(teamSize)
    : selectedMode.format;
  const scoringType: ScoringType = selectedMode.scoring;
  const casualGame = isCasualGameScoringType(scoringType);
  const [wolf, setWolf] = useState<WolfSettings>(DEFAULT_WOLF_SETTINGS);
  const [imposter, setImposter] = useState<ImposterSettings>(DEFAULT_IMPOSTER_SETTINGS);
  const [notes, setNotes] = useState("");
  const [trackStats, setTrackStats] = useState(true);

  // Browser scoring code (created before the round starts so players can join the card).
  const [createdRoundId, setCreatedRoundId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [codePin, setCodePin] = useState("");
  const [creatingCode, setCreatingCode] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [joinedGuests, setJoinedGuests] = useState<string[]>([]);

  const [layouts, setLayouts] = useState<LayoutOption[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(layoutId);
  const selectedLayout = useMemo(
    () => layouts.find((l) => l.id === selectedLayoutId) ?? null,
    [layouts, selectedLayoutId],
  );
  const effectiveHoleCount = selectedLayout?.hole_count ?? holeCount;
  // Once a browser scoring code exists the card is live, so stop editing it here.
  const cardLocked = !!createdRoundId;
  // Only singles stroke play can be rated: team cards share a score and the
  // casual games are settled by their own points. Practice loops are excluded.
  // A rated card needs at least two rated (non-guest) scorers and a real round.
  const ratedPlayerCount = players.filter((p) => p.kind !== "guest").length;
  const canRate = ratedPlayerCount >= 2 && roundContext !== "practice";
  const ratedEligible = selectedMode.rateable && canRate;
  const effectiveRatingMode = ratedEligible ? ratingMode : "casual";
  const scoringName = scoringTypeLabel(scoringType);
  const modeFit = gameModeFitsCard(selectedMode, players.length, teamSize);
  const scoringFit = modeFit;
  const throwStyleName =
    TEAM_THROW_STYLE_OPTIONS.find((o) => o.value === throwStyle)?.label ?? "Throw style";

  // Every game stays pickable; the card just tells you who else it needs.
  const teamSizeNeeds = useMemo(
    () =>
      TEAM_SIZE_OPTIONS.map((t) => ({
        ...t,
        needed: Math.max(0, t.size * 2 - players.length),
      })),
    [players.length],
  );
  const modeNeeds = useMemo(
    () =>
      ROUND_GAME_MODES.map((m) => {
        const min = m.teams ? Math.max(m.minPlayers, teamSize * 2) : m.minPlayers;
        return { mode: m, needed: Math.max(0, min - players.length) };
      }),
    [players.length, teamSize],
  );
  // Rated rounds are singles stroke play only — flip back to casual automatically.
  useEffect(() => {
    if (!ratedEligible && ratingMode === "dgd_rated") setRatingMode("casual");
  }, [ratedEligible, ratingMode]);

  // Seed with self
  useEffect(() => {
    if (!open || !user) return;
    setPlayers((prev) => {
      if (prev.some((p) => p.kind === "self")) return prev;
      const meName =
        (user.user_metadata?.display_name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        user.email?.split("@")[0] ||
        "Me";
      return [{ key: `self-${user.id}`, kind: "self", user_id: user.id, name: meName }, ...prev];
    });
    setStartingHole(1);
    setSelectedLayoutId(layoutId);
    setCreatedRoundId(null);
    setJoinCode(null);
    setQrSrc(null);
    setJoinedGuests([]);
    setCodePin("");
    setNotes("");
    // Honor the round type picked on the Start a round selector, if any.
    const pending = takePendingRoundType();
    if (pending) setRatingMode(pending);
  }, [open, user, layoutId]);

  // QR image for the browser scoring code.
  useEffect(() => {
    if (!joinCode) {
      setQrSrc(null);
      return;
    }
    let cancel = false;
    const url = `${window.location.origin}/score?c=${joinCode}`;
    void QRCode.toDataURL(url, { width: 480, margin: 1 }).then((d) => {
      if (!cancel) setQrSrc(d);
    });
    return () => {
      cancel = true;
    };
  }, [joinCode]);

  // Watch the card fill up while players join from their browsers.
  useEffect(() => {
    if (!open || !createdRoundId) return;
    let cancel = false;
    const load = async () => {
      const { data } = await supabase
        .from("round_players")
        .select("guest_name, user_id, position")
        .eq("round_id", createdRoundId)
        .order("position", { ascending: true });
      if (cancel) return;
      const names = ((data as { guest_name: string | null; user_id: string | null }[] | null) ?? [])
        .filter((r) => !!r.guest_name && !r.user_id)
        .map((r) => r.guest_name as string);
      setJoinedGuests(names);
    };
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, [open, createdRoundId]);

  // Load layouts for this course.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("course_layouts")
        .select("id, name, hole_count, par_total, is_default")
        .eq("course_id", courseId)
        // Draft layouts (e.g. named on a listing but not built yet) can't be scored.
        .neq("status", "draft");
      if (cancel) return;
      // Order by what's actually being played here, starting with the layout
      // this player used on their last round at this course.
      const rows = await loadPlayerLayoutOrder(
        courseId,
        (data as LayoutOption[] | null) ?? [],
        user?.id,
      );
      if (cancel) return;
      setLayouts(rows);
      // If the caller didn't pass a layoutId, take the top-ranked layout.
      if (!layoutId && rows.length > 0) {
        setSelectedLayoutId(rows[0].id);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, courseId, layoutId, user?.id]);

  // Load recent card-mates (last 90 days, distinct).
  useEffect(() => {
    if (!open || !user) return;
    let cancel = false;
    (async () => {
      const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data: myRps } = await supabase
        .from("round_players")
        .select("round_id, rounds!inner(started_at)")
        .eq("user_id", user.id)
        .gte("rounds.started_at", cutoff)
        .limit(60);
      const roundIds = ((myRps as { round_id: string }[] | null) ?? []).map((r) => r.round_id);
      if (roundIds.length === 0) {
        if (!cancel) setRecent([]);
        return;
      }
      const { data: mates } = await supabase
        .from("round_players")
        .select("user_id")
        .in("round_id", roundIds)
        .not("user_id", "is", null);
      const counts = new Map<string, number>();
      for (const m of (mates as { user_id: string | null }[] | null) ?? []) {
        if (!m.user_id || m.user_id === user.id) continue;
        counts.set(m.user_id, (counts.get(m.user_id) ?? 0) + 1);
      }
      const ordered = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id]) => id);
      if (ordered.length === 0) {
        if (!cancel) setRecent([]);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ordered);
      if (cancel) return;
      const byId = new Map(((profs as FriendProfile[] | null) ?? []).map((p) => [p.id, p]));
      setRecent(ordered.map((id) => byId.get(id)).filter((v): v is FriendProfile => !!v));
    })();
    return () => {
      cancel = true;
    };
  }, [open, user]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setLoadingFriends(true);
    const { data: fs } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted");
    const otherIds = ((fs as { requester_id: string; addressee_id: string }[] | null) ?? []).map(
      (r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id),
    );
    if (!otherIds.length) {
      setFriends([]);
      setLoadingFriends(false);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", otherIds);
    setFriends((profs as FriendProfile[]) ?? []);
    setLoadingFriends(false);
  }, [user]);

  useEffect(() => {
    if (open) void loadFriends();
  }, [open, loadFriends]);

  const selectedIds = useMemo(
    () =>
      new Set(
        players.filter((p) => p.kind !== "guest").map((p) => (p as { user_id: string }).user_id),
      ),
    [players],
  );

  function toggleFriend(f: FriendProfile) {
    setPlayers((prev) => {
      if (selectedIds.has(f.id)) return prev.filter((p) => !("user_id" in p) || p.user_id !== f.id);
      const name = f.display_name || f.username || "Player";
      return [
        ...prev,
        { key: `f-${f.id}`, kind: "friend", user_id: f.id, name, avatar_url: f.avatar_url },
      ];
    });
  }

  function addGuest() {
    const trimmed = guestName.trim();
    if (!trimmed) return;
    setPlayers((prev) => [...prev, { key: `g-${Date.now()}`, kind: "guest", name: trimmed }]);
    setGuestName("");
  }

  function removePlayer(key: string) {
    setPlayers((prev) => prev.filter((p) => p.key !== key));
  }

  function movePlayer(key: string, dir: -1 | 1) {
    setPlayers((prev) => {
      const idx = prev.findIndex((p) => p.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  /** Creates the round row + card once; returns the round id. */
  async function ensureRound(): Promise<string | null> {
    if (createdRoundId) return createdRoundId;
    const useLayoutId = selectedLayoutId ?? layoutId;
    if (!user) return null;
    if (!courseId) {
      toast.error("Pick a course before starting the round");
      return null;
    }
    if (!useLayoutId) {
      toast.error("Pick a layout before starting the round");
      return null;
    }
    if (!players.length) {
      toast.error("Add at least one player");
      return null;
    }
    const { data: round, error } = await supabase
      .from("rounds")
      .insert({
        course_id: courseId,
        layout_id: useLayoutId,
        created_by: user.id,
        is_rated: effectiveRatingMode === "dgd_rated",
        rating_mode: effectiveRatingMode,
        play_format: playFormat,
        team_throw_style: playFormat === "singles" ? null : throwStyle,
        team_size: playFormat === "singles" ? null : teamSize,
        scoring_type: scoringType,
        use_handicap: useHandicap,
        scoring_config:
          scoringType === "wolf" ? wolf : scoringType === "imposter" ? imposter : null,
        round_context: roundContext,
        notes: notes.trim() ? notes.trim() : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    const roundId = (round as { id: string }).id;
    const rows = players.map((p, i) => ({
      round_id: roundId,
      user_id: p.kind === "guest" ? null : p.user_id,
      guest_name: p.kind === "guest" ? p.name : null,
      position: i,
    }));
    const { error: perr } = await supabase.from("round_players").insert(rows);
    if (perr) throw perr;
    setCreatedRoundId(roundId);
    // Every round gets its own join code and link automatically.
    await ensureCode(roundId);
    return roundId;
  }

  /** Mints (or reuses) this round's browser join code. Never blocks the round. */
  async function ensureCode(roundId: string): Promise<void> {
    if (joinCode) return;
    setCreatingCode(true);
    try {
      const res = await ensureRoundJoinCode({
        data: {
          round_id: roundId,
          pin: codePin.trim() ? codePin.trim() : null,
          label: `${courseName} · ${new Date().toLocaleDateString()}`,
        },
      });
      setJoinCode(res.code);
    } catch {
      // A missing code never stops the round; the scorer page can mint one.
    } finally {
      setCreatingCode(false);
    }
  }

  async function handleCreateCode() {
    if (codePin.trim() && !/^\d{4}$/.test(codePin.trim())) {
      toast.error("Use exactly four digits for the PIN, or leave it blank.");
      return;
    }
    setCreatingCode(true);
    try {
      const roundId = await ensureRound();
      if (!roundId) return;
      await ensureCode(roundId);
      if (joinCode) toast.success("Your card is live — share the code.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't create a scoring code. Try again.");
    } finally {
      setCreatingCode(false);
    }
  }

  const inviteText = joinCode
    ? `Keep score for our round at ${courseName}.\nOpen ${typeof window === "undefined" ? "" : window.location.origin}/score?c=${joinCode} and enter code ${joinCode}.\nNo app or account needed.${codePin.trim() ? `\nPIN: ${codePin.trim()}` : ""}`
    : "";

  async function shareCode() {
    if (!joinCode) return;
    const url = `${window.location.origin}/score?c=${joinCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join our scorecard", text: inviteText, url });
        return;
      }
      await navigator.clipboard.writeText(inviteText);
      toast.success("Scoring link copied.");
    } catch {
      /* dismissed */
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      const roundId = await ensureRound();
      if (!roundId) return;
      // Pass starting hole to scorer via sessionStorage.
      try {
        sessionStorage.setItem(`round:${roundId}:startingHole`, String(startingHole));
        sessionStorage.setItem(`round:${roundId}:trackStats`, trackStats ? "1" : "0");
      } catch {
        // storage may be unavailable; scorer defaults to hole 1
      }
      onOpenChange(false);
      navigate({ to: "/play/$roundId", params: { roundId } });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't start this round. Give it another shot.",
      );
    } finally {
      setStarting(false);
    }
  }

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        (f.display_name ?? "").toLowerCase().includes(q) ||
        (f.username ?? "").toLowerCase().includes(q),
    );
  }, [friends, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[92vh] overflow-y-auto sm:w-[92vw]">
        <DialogHeader>
          <DialogTitle>Start a round</DialogTitle>
          <DialogDescription>{courseName} · Set up your card before you tee off.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Layout picker */}
          <section>
            <Label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Flag className="h-4 w-4" /> Layout
            </Label>
            {layouts.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                <p>
                  Scoring layout pending — nobody has mapped this course's holes yet. Build one and
                  you can tee off right after.
                </p>
                {courseId ? (
                  <Button size="sm" className="mt-2" asChild>
                    <Link
                      to="/courses/$courseId/edit"
                      params={{ courseId }}
                      onClick={() => onOpenChange(false)}
                    >
                      <Flag className="mr-1 h-3.5 w-3.5" /> Build a layout
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <Select
                  value={selectedLayoutId ?? ""}
                  disabled={cardLocked}
                  onValueChange={(v) => setSelectedLayoutId(v)}
                >
                  <SelectTrigger className="w-full sm:w-96">
                    <SelectValue placeholder="Choose a layout" />
                  </SelectTrigger>
                  <SelectContent>
                    {layouts.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} · {l.hole_count} holes{l.par_total ? ` · par ${l.par_total}` : ""}
                        {l.is_default ? " · default" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scoring uses the tees, pars, and distances from this layout.
                </p>
              </>
            )}
          </section>

          {/* Round type: Rated vs Casual — sets the whole DGD rules bar */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4" /> Round type
              </Label>
              <RatedRoundRulesSheet />
            </div>
            <div className={"grid gap-2 " + (canRate ? "sm:grid-cols-2" : "")}>
              {canRate && (
                <button
                  type="button"
                  disabled={cardLocked}
                  onClick={() => {
                    setRatingMode("dgd_rated");
                    setGameModeId("singles_stroke");
                  }}
                  className={
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition " +
                    (ratingMode === "dgd_rated"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-card hover:bg-accent")
                  }
                  aria-pressed={ratingMode === "dgd_rated"}
                >
                  <Trophy
                    className={
                      "mt-0.5 h-4 w-4 " +
                      (ratingMode === "dgd_rated" ? "text-primary" : "text-muted-foreground")
                    }
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">DGD Rated round</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Singles stroke play under PDGA sanctioned rules. Scores feed your DGD rating
                      and the Statboard.
                    </p>
                  </div>
                </button>
              )}
              <button
                type="button"
                disabled={cardLocked}
                onClick={() => setRatingMode("casual")}
                className={
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition " +
                  (ratingMode === "casual"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-accent")
                }
                aria-pressed={ratingMode === "casual"}
              >
                <Coffee
                  className={
                    "mt-0.5 h-4 w-4 " +
                    (ratingMode === "casual" ? "text-primary" : "text-muted-foreground")
                  }
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Casual round</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Just for fun or practice. Scores and stats are saved, but never counted toward
                    DGD ratings.
                  </p>
                </div>
              </button>
            </div>
            {!canRate && (
              <p className="mt-2 text-xs text-muted-foreground">
                {roundContext === "practice"
                  ? "Practice loops are always casual — they're kept out of your rating."
                  : "Add a second rated player to your card to make this a DGD Rated round."}
              </p>
            )}
            {ratingMode === "dgd_rated"
              ? (() => {
                  const cardSize = players.length || 1;
                  const ratedScorers = players.filter((p) => p.kind !== "guest").length;
                  const ok = meetsSanctionedThreshold(cardSize, ratedScorers);
                  const needed = requiredScorerCount(cardSize);
                  return (
                    <div
                      className={
                        "mt-2 flex items-start gap-2 rounded-md border p-2 text-xs " +
                        (ok
                          ? "border-primary/30 bg-primary/5 text-foreground"
                          : "border-amber-500/40 bg-amber-500/10 text-foreground")
                      }
                    >
                      <AlertTriangle
                        className={
                          "mt-0.5 h-3.5 w-3.5 shrink-0 " + (ok ? "text-primary" : "text-amber-600")
                        }
                      />
                      <span>
                        {ok
                          ? `Rated card ready — ${ratedScorers} of ${cardSize} scoring meets the DGD threshold (needs ${needed}).`
                          : cardSize < 2
                            ? "Add another rated player. Solo rounds can't submit for DGD rating."
                            : `Need ${needed} scoring players on this ${cardSize}-player card. Right now: ${ratedScorers}. If it stays below the bar at submit, the round will be recorded as Casual.`}
                      </span>
                    </div>
                  );
                })()
              : null}
          </section>

          {/* Recent partners */}
          {recent.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Recent partners
              </div>
              <div className="flex flex-wrap gap-1">
                {recent.map((f) => {
                  const isOn = selectedIds.has(f.id);
                  const label = f.display_name || f.username || "Player";
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={cardLocked}
                      onClick={() => toggleFriend(f)}
                      className={
                        "rounded-full border px-2 py-1 text-xs transition " +
                        (isOn
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:bg-accent")
                      }
                    >
                      {isOn ? "✓ " : "+ "}
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Players from your recent rounds — tap to add.
              </p>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" /> Players on card ({players.length})
            </div>
            {players.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                Add yourself, friends, or guests below.
              </div>
            ) : (
              <ul className="space-y-1">
                {players.map((p, i) => (
                  <li
                    key={p.key}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">
                      {p.name}
                      {p.kind === "self" ? (
                        <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                      ) : null}
                      {p.kind === "guest" ? (
                        <span className="ml-1 text-xs text-muted-foreground">(guest)</span>
                      ) : null}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move player up"
                      className="h-7 w-7"
                      disabled={i === 0 || cardLocked}
                      onClick={() => movePlayer(p.key, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Move player down"
                      className="h-7 w-7"
                      disabled={i === players.length - 1 || cardLocked}
                      onClick={() => movePlayer(p.key, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    {p.kind !== "self" ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove player"
                        className="h-7 w-7 text-destructive"
                        disabled={cardLocked}
                        onClick={() => removePlayer(p.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <span className="w-7" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Add friends */}
          <section>
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Add friends
              </span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends"
                className="h-7 w-40 text-xs"
              />
            </div>
            {loadingFriends ? (
              <div className="text-xs text-muted-foreground">Loading friends…</div>
            ) : filteredFriends.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                {friends.length === 0
                  ? "No friends yet — add some from the Friends page."
                  : "No matches."}
              </div>
            ) : (
              <ul className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {filteredFriends.map((f) => {
                  const checked = selectedIds.has(f.id);
                  const label = f.display_name || f.username || "Player";
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm hover:bg-accent">
                        <Checkbox
                          checked={checked}
                          disabled={cardLocked}
                          onCheckedChange={() => toggleFriend(f)}
                        />
                        <span className="truncate">{label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Add guest */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <UserPlus className="h-4 w-4" /> Add guest
            </div>
            <div className="flex gap-2">
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGuest();
                  }
                }}
                placeholder="Guest name"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addGuest}
                disabled={!guestName.trim() || cardLocked}
              >
                Add
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Guests appear on your card only; they can't view scores in-app.
            </p>
          </section>

          {/* Starting hole */}
          <section>
            <Label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Flag className="h-4 w-4" /> Starting hole
            </Label>
            <Select value={String(startingHole)} onValueChange={(v) => setStartingHole(Number(v))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: Math.max(1, effectiveHoleCount) }, (_, i) => i + 1).map(
                  (n) => (
                    <SelectItem key={n} value={String(n)}>
                      Hole {n}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Useful for shotgun starts — scoring will begin here and wrap around.
            </p>
          </section>

          {/* What kind of round this is */}
          <section>
            <Label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" /> Round type
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROUND_CONTEXTS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setRoundContext(c.value)}
                  aria-pressed={roundContext === c.value}
                  className={
                    "rounded-lg border p-3 text-left transition " +
                    (roundContext === c.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-card hover:bg-accent")
                  }
                >
                  <div className="text-sm font-semibold">{c.label}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.blurb}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Pick your game — one choice sets the format and the scoring */}
          <section>
            <Label className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4" /> Pick your game
            </Label>
            <p className="mb-2 text-xs text-muted-foreground">
              One pick sets how you play and how the card is settled. New to a game? Open its rules
              — they're written to learn from on the tee pad.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {modeNeeds.map(({ mode: m, needed }) => {
                const selected = m.id === gameModeId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGameModeId(m.id)}
                    aria-pressed={selected}
                    className={
                      "rounded-lg border p-3 text-left transition " +
                      (selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                        : "border-border bg-card hover:bg-accent")
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (m.rateable
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {m.rateable ? "DGD rateable" : "Casual"}
                      </span>
                      {needed > 0 && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          Add {needed} more {needed === 1 ? "player" : "players"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{m.tagline}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.how}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {m.maxPlayers
                        ? `${m.minPlayers}–${m.maxPlayers} players`
                        : `${m.minPlayers}+ players`}
                      {m.teams ? " · split into teams" : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            {ratingMode === "dgd_rated" && !selectedMode.rateable && (
              <p className="mt-2 text-xs text-muted-foreground">
                Rated rounds are singles stroke play only, so this round will be saved as casual.
              </p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-3">
              {selectedMode.rulebookIds.map((id) => (
                <GameRulesSheet
                  key={id}
                  id={id}
                  label={`How to play ${rulebookEntry(id)?.name ?? selectedMode.label}`}
                />
              ))}
            </div>

            {!modeFit.ok && modeFit.reason && (
              <p className="mt-2 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {modeFit.reason}
              </p>
            )}
            {modeFit.ok && modeFit.reason && (
              <p className="mt-2 text-xs text-muted-foreground">{modeFit.reason}</p>
            )}

            {/* Team setup */}
            {selectedMode.teams && (
              <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
                <div>
                  <Label className="mb-2 block text-sm font-semibold">Team size</Label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {teamSizeNeeds.map((t) => (
                      <button
                        key={t.size}
                        type="button"
                        onClick={() => setTeamSize(t.size)}
                        aria-pressed={teamSize === t.size}
                        className={
                          "rounded-lg border p-2.5 text-left transition " +
                          (teamSize === t.size
                            ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                            : "border-border bg-card hover:bg-accent")
                        }
                      >
                        <div className="text-sm font-semibold">{t.label}</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.blurb} Needs {t.size * 2}+ players.
                          {t.needed > 0
                            ? ` Add ${t.needed} more ${t.needed === 1 ? "player" : "players"}.`
                            : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-semibold">Throw style</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {TEAM_THROW_STYLE_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setThrowStyle(s.value)}
                        aria-pressed={throwStyle === s.value}
                        className={
                          "rounded-lg border p-2.5 text-left transition " +
                          (throwStyle === s.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                            : "border-border bg-card hover:bg-accent")
                        }
                      >
                        <div className="text-sm font-semibold">{s.label}</div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.blurb}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-1">
                    <GameRulesSheet id={throwStyle} label={`${throwStyleName} rules`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {teamSizeLabel(teamSize)} records one score per team per hole, so team rounds are
                  always saved as casual.
                </p>
              </div>
            )}

            <label className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <span className="text-sm font-semibold">
                Apply handicaps
                <span className="block text-xs font-normal text-muted-foreground">
                  Adjust each player's total against their rating for the friendly result. Raw
                  scores are still what gets rated.
                </span>
              </span>
              <Switch checked={useHandicap} onCheckedChange={setUseHandicap} />
            </label>
            {!ratedEligible && ratingMode === "dgd_rated" && (
              <p className="mt-2 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Only singles stroke play can be DGD rated. This card will be saved as a casual
                round.
              </p>
            )}
          </section>

          {/* Casual game settings — Wolf / Imposter are scoring types, not add-ons */}
          {casualGame && (
            <section>
              <Label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Swords className="h-4 w-4" /> {scoringName} setup
              </Label>
              <p className="mb-2 text-xs text-muted-foreground">
                A casual game for playing with friends. Everyone still records their own scores, so
                your stats stay accurate — the round just isn't rated.
              </p>
              <div className="mt-1 space-y-3 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{scoringName} settings</span>
                  <GameRulesSheet id={scoringType} label={`${scoringName} rules`} />
                </div>
                {!scoringFit.ok && scoringFit.reason && (
                  <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {scoringFit.reason}
                  </p>
                )}

                {scoringType === "wolf" && (
                  <div className="space-y-3">
                    <div className="w-56">
                      <Label htmlFor="wolf-tee-order" className="mb-1 block text-xs">
                        Wolf tees
                      </Label>
                      <Select
                        value={wolf.wolfTeeOrder}
                        onValueChange={(v) =>
                          setWolf((w) => ({ ...w, wolfTeeOrder: v as "first" | "last" }))
                        }
                      >
                        <SelectTrigger id="wolf-tee-order">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last">
                            Last — call a partner as each player throws
                          </SelectItem>
                          <SelectItem value="first">First — throw, then watch the rest</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-2.5">
                      <span className="text-sm font-semibold">
                        Blind Wolf allowed
                        <span className="block text-xs font-normal text-muted-foreground">
                          The Wolf can declare solo before anyone throws for double Lone Wolf
                          points.
                        </span>
                      </span>
                      <Switch
                        checked={wolf.blindWolf}
                        onCheckedChange={(v) => setWolf((w) => ({ ...w, blindWolf: v }))}
                      />
                    </label>
                    <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-2.5">
                      <span className="text-sm font-semibold">
                        Carry over tied holes
                        <span className="block text-xs font-normal text-muted-foreground">
                          A tied hole rolls its points into the next hole instead of scoring zero.
                        </span>
                      </span>
                      <Switch
                        checked={wolf.carryover}
                        onCheckedChange={(v) => setWolf((w) => ({ ...w, carryover: v }))}
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {(
                        [
                          ["wolfTeamWin", "Wolf + partner win"],
                          ["huntersWin", "Hunters win"],
                          ["loneWolfWin", "Lone Wolf wins"],
                          ["beatLoneWolf", "Beat a Lone Wolf"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key}>
                          <Label htmlFor={`wolf-${key}`} className="mb-1 block text-xs">
                            {label}
                          </Label>
                          <Input
                            id={`wolf-${key}`}
                            type="number"
                            min={0}
                            max={20}
                            value={wolf.points[key]}
                            onChange={(e) =>
                              setWolf((w) => ({
                                ...w,
                                points: {
                                  ...w.points,
                                  [key]: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Points per hole. Settle up at the end by the point difference times whatever
                      you agreed a point is worth.
                    </p>
                  </div>
                )}

                {scoringType === "imposter" && (
                  <div className="space-y-3">
                    <div className="w-56">
                      <Label htmlFor="imposter-vote" className="mb-1 block text-xs">
                        When the card votes
                      </Label>
                      <Select
                        value={imposter.voteAt}
                        onValueChange={(v) =>
                          setImposter((s) => ({
                            ...s,
                            voteAt: v as ImposterSettings["voteAt"],
                          }))
                        }
                      >
                        <SelectTrigger id="imposter-vote">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hole_9">After hole 9</SelectItem>
                          <SelectItem value="end">At the end of the round</SelectItem>
                          <SelectItem value="any_hole">Any hole the group calls it</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-2.5">
                      <span className="text-sm font-semibold">
                        Rotate the hidden role
                        <span className="block text-xs font-normal text-muted-foreground">
                          Reassign the Imposter every three holes so suspicion resets.
                        </span>
                      </span>
                      <Switch
                        checked={imposter.rotateRole}
                        onCheckedChange={(v) => setImposter((s) => ({ ...s, rotateRole: v }))}
                      />
                    </label>
                    <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-2.5">
                      <span className="text-sm font-semibold">
                        Tell the Imposter the crew's target
                        <span className="block text-xs font-normal text-muted-foreground">
                          Hint mode makes it easier to steer the group wrong.
                        </span>
                      </span>
                      <Switch
                        checked={imposter.hintMode}
                        onCheckedChange={(v) => setImposter((s) => ({ ...s, hintMode: v }))}
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Stat tracking + notes */}
          <section className="space-y-3">
            <label className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <span className="text-sm font-semibold">
                Track detailed stats
                <span className="block text-xs font-normal text-muted-foreground">
                  Fairway hits, C1/C2 in regulation, scrambles, and putts per hole. Turn it off for
                  a fast scores-only card.
                </span>
              </span>
              <Switch checked={trackStats} onCheckedChange={setTrackStats} />
            </label>
            <div>
              <Label
                htmlFor="round-notes"
                className="mb-2 flex items-center gap-2 text-sm font-semibold"
              >
                <NotebookPen className="h-4 w-4" /> Round notes (optional)
              </Label>
              <Textarea
                id="round-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tee pads, wind, layout tweaks — anything worth remembering later."
                rows={2}
              />
            </div>
          </section>

          {/* Browser scoring code */}
          <section>
            <Label className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <QrCode className="h-4 w-4" /> Browser scoring code
            </Label>
            {!joinCode ? (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Every round gets its own code and link automatically. Create the card now if you
                  want players to join from a phone browser before you tee off — no app, no account.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40">
                    <Label htmlFor="round-code-pin" className="mb-1 block text-xs">
                      4-digit PIN (optional)
                    </Label>
                    <Input
                      id="round-code-pin"
                      inputMode="numeric"
                      maxLength={4}
                      value={codePin}
                      onChange={(e) => setCodePin(e.target.value.replace(/\D/g, ""))}
                      placeholder="Leave blank"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCreateCode()}
                    disabled={
                      creatingCode || players.length === 0 || !(selectedLayoutId ?? layoutId)
                    }
                  >
                    {creatingCode ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="mr-1 h-4 w-4" />
                    )}
                    Create card now
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Otherwise the code is generated the moment you start the round.
                </p>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-2xl font-semibold tracking-widest">
                    {joinCode}
                  </span>
                  {codePin.trim() ? (
                    <span className="text-xs text-muted-foreground">PIN {codePin.trim()}</span>
                  ) : null}
                  {qrSrc ? (
                    <img
                      src={qrSrc}
                      alt={`QR code to join scoring for ${courseName}`}
                      className="h-20 w-20 rounded bg-background p-1"
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void shareCode()}
                  >
                    <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.location.href = `sms:?&body=${encodeURIComponent(inviteText)}`;
                    }}
                  >
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Text it
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(joinCode);
                      toast.success("Code copied.");
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy code
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {joinedGuests.length === 0
                    ? "Waiting on browser scorers — they show up here the moment they join."
                    : `Joined from a browser: ${joinedGuests.join(", ")}`}
                </p>
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={starting}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={
              starting || !(selectedLayoutId ?? layoutId) || players.length === 0 || !modeFit.ok
            }
          >
            {starting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            {cardLocked ? "Start scoring" : "Start round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
