import { useQuery } from "@tanstack/react-query";
import { channelNonce } from "@/lib/realtime";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  UserPlus,
  X,
  Share2,
  Minus,
  Plus,
  Check,
  ListOrdered,
  Trophy,
  Flag,
  Sun,
  Moon,
  BookOpen,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { fetchWeatherForPoint } from "@/lib/data-connectors.functions";
import { getRoundEventLeaderboard } from "@/lib/play.functions";

import { useServerFn } from "@tanstack/react-start";
import {
  parseCurrent,
  weatherCodeLabel,
  weatherCodeIcon,
  windCompass,
  type CurrentWeather,
} from "@/components/weather-widget";
import { GpsHoleTracker } from "@/components/gps-hole-tracker";
import { upsertScoresWithOfflineFallback, syncOfflineQueue, getQueuedItems, mergeQueuedScores } from "@/lib/offline-queue";
import { reconcileScoringDrafts } from "@/lib/scoring-drafts";
import { RoundHeader, HeaderWeatherChip } from "@/components/scoring/round-header";
import { HoleStage } from "@/components/scoring/hole-stage";
const LazyTeeSign = lazy(() => import("@/components/pages/tee-signs-page"));

import { ScoreDial, scoreLabel } from "@/components/scoring/score-dial";
import { LiveScoresPanel } from "@/components/scoring/live-scores-panel";
import { PaceTracker } from "@/components/scoring/pace-tracker";
import { RoundHeaderSlot } from "@/components/scoring/header-slot";
import { Crosshair as CrosshairIcon, Sparkles as SparklesIcon } from "lucide-react";
import { CourseIssueRadar } from "@/components/course/course-issue-radar";
import { RunningTotalLine } from "@/components/scoring/running-total-line";
import { firstUnscoredHole, playerRunningTotals } from "@/lib/scoring-progress";
import { useScoringKeyboard } from "@/hooks/use-scoring-keyboard";
import { GameSummaryPanel, GameSettlementPanel } from "@/components/scoring/game-panel";
import { formatRoundPlayLine, gameModeFromRound } from "@/lib/competition-model";
import { HoleNotesPanel } from "@/components/scoring/hole-notes-panel";
import { RoundInsightsPanel } from "@/components/scoring/round-insights-panel";
import { HoleHistoryPanel } from "@/components/scoring/hole-history-panel";
import { HoleFieldPanel } from "@/components/scoring/hole-field-panel";
import { RoundRatingPanel } from "@/components/scoring/round-rating-panel";
import { AcePanel } from "@/components/scoring/ace-panel";
import { JoinCodePanel } from "@/components/scoring/join-code-panel";

import { HoleValueNote } from "@/components/scoring/hole-value-note";
import {
  RoundShareDialog,
  type RoundShareSummary,
  type ShareVisibility,
} from "@/components/scoring/round-share-dialog";
import { tagPlayersOnPost } from "@/lib/post-tags.functions";
import { useWakeLock, tapHaptic } from "@/lib/use-wake-lock";
import {
  bearingBetween,
  windEffect,
  shapeAdvice,
  holePlaysLikeFt,
  teeFacingNote,
  windFromNote,
  elevationNote,
} from "@/lib/scoring-caddy";

import { ShotTrackerPanel } from "@/components/scoring/shot-tracker-panel";
import { RoundShotStatsPanel } from "@/components/scoring/round-shot-stats-panel";
import { HoleHeatmapPanel } from "@/components/scoring/hole-heatmap-panel";
import { useIsMobile, useLandscapePhone } from "@/hooks/use-mobile";
import { formatToPar } from "@/lib/score-display";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RoundScorecardGrid } from "@/components/scoring/round-scorecard-grid";

import { getQueuedCount } from "@/lib/offline-queue";

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
import { RatedRoundRulesSheet } from "@/components/rated-round-rules-sheet";
import { RecordThrowButton, RecordThrowSheet } from "@/components/scoring/record-throw-sheet";
import { RoundGlanceStrip } from "@/components/scoring/round-glance-strip";
import { useRoundWalk } from "@/hooks/use-round-walk";
import {
  meetsSanctionedThreshold,
  requiredScorerCount,
  isRoundCommitted,
} from "@/lib/dgd-rated-rules";
import { AlertTriangle, ShieldCheck, Maximize, Minimize, Crosshair } from "lucide-react";

import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { describeMappedFeatures } from "@/lib/director-kit";

export const Route = createFileRoute("/_authenticated/play/$roundId")({
  component: PlayRound,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This round" />,
  head: () => ({
    meta: [
      { title: "Scoring · DG Dashboard" },
      {
        name: "description",
        content: "Live scorecard, GPS caddy, and event leaderboard for your round.",
      },
      { property: "og:title", content: "Scoring · DG Dashboard" },
      {
        property: "og:description",
        content: "Live scorecard, GPS caddy, and event leaderboard for your round.",
      },
    ],
  }),
});

type Round = {
  id: string;
  course_id: string;
  layout_id: string;
  created_by: string;
  status: "in_progress" | "completed" | "abandoned";
  tournament_id?: string | null;
  tournament_round_id?: string | null;
  league_event_id?: string | null;
  is_rated?: boolean;
  rating_mode?: "dgd_rated" | "casual";
  round_context?: string | null;
  play_format?: string | null;
  team_throw_style?: string | null;
  team_size?: number | null;
  scoring_type?: string | null;
  scoring_config?: unknown;
};
type Hole = {
  number: number;
  par: number;
  distance_ft: number | null;
  nickname?: string | null;
  map_snapshot_path?: string | null;
  map_snapshot_url?: string | null;
  tee_lat?: number | null;
  tee_lng?: number | null;
  basket_lat?: number | null;
  basket_lng?: number | null;
  elevation_ft?: number | null;
};

type Player = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  position: number;
  display?: string;
};
type Score = { round_player_id: string; hole_number: number; strokes: number };
type Confirmation = {
  round_player_id: string;
  hole_number: number;
  confirmed_by: string;
  strokes: number;
};
type EventLeaderRow = {
  name: string;
  total: number;
  toPar: number;
  thru: number;
  isMe: boolean;
  division?: string | null;
};
type EventInfo = {
  kind: "tournament" | "league";
  id: string;
  name: string;
  rows: EventLeaderRow[];
};

function PlayRound() {
  const { roundId } = Route.useParams();
  const { user } = useSession();
  const [roundStatusForWalk, setRoundStatusForWalk] = useState<string | null>(null);
  const walk = useRoundWalk(roundId, user?.id ?? null, roundStatusForWalk === "in_progress");
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [round, setRound] = useState<Round | null>(null);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [holeFeatures, setHoleFeatures] = useState<Map<number, string[]>>(new Map());
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [activeHole, setActiveHole] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [loadingCard, setLoadingCard] = useState(true);
  const [asideTab, setAsideTab] = useState("caddy");
  // Phone: tools live in a bottom sheet; one player's score control at a time.
  const isNarrow = useIsMobile();
  const isLandscapePhone = useLandscapePhone();
  const isPhone = isNarrow || isLandscapePhone;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [throwOpen, setThrowOpen] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const openTool = (tab: string) => {
    setAsideTab(tab);
    setToolsOpen(true);
  };

  const fetchWeather = useServerFn(fetchWeatherForPoint);

  // Pending strokes per player, seeded to par or saved score when hole activates
  const [pending, setPending] = useState<Record<string, number>>({});
  const dirtyScores = useRef(new Set<string>());
  const liveRequest = useRef(0);
  useEffect(() => {
    dirtyScores.current.clear();
    setPending({});
    setActiveHole(1);
  }, [roundId]);
  // Throws + penalties from Record throw, per player:hole — used only to double-check the entered score.
  const [trackedScore, setTrackedScore] = useState<Record<string, number>>({});
  const [scoreCheck, setScoreCheck] = useState<{ key: string; tracked: number; entered: number } | null>(null);

  const FULLSCREEN_KEY = "dgd.play.fullscreen";
  const ROUND_COLUMNS =
    "id, course_id, layout_id, created_by, status, tournament_id, tournament_round_id, league_event_id, is_rated, rating_mode, round_context, play_format, team_throw_style, team_size, scoring_type, scoring_config, event_snapshot";

  /**
   * Live slice: who is on the card, their strokes, and confirmations. This is
   * the only data a realtime score push can change, so it refreshes on its own
   * without re-reading the course design or weather.
   */
  const loadLive = useCallback(async () => {
    const request = ++liveRequest.current;
    const [playerResult, scoreResult, confirmationResult] = await Promise.all([
      supabase
        .from("round_players")
        .select("id, user_id, guest_name, position")
        .eq("round_id", roundId)
        .order("position"),
      supabase
        .from("round_scores")
        .select("round_player_id, hole_number, strokes")
        .eq("round_id", roundId),
      supabase
        .from("round_score_confirmations")
        .select("round_player_id, hole_number, confirmed_by, strokes")
        .eq("round_id", roundId),
    ]);
    for (const result of [playerResult, scoreResult, confirmationResult]) {
      if (result.error) throw new Error(result.error.message);
    }
    const ps = playerResult.data, sc = scoreResult.data, cf = confirmationResult.data;
    const parr = (ps as Player[]) ?? [];
    const userIds = parr.map((p) => p.user_id).filter((x): x is string => !!x);
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", userIds);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      parr.forEach((p) => {
        if (p.user_id)
          p.display =
            (map.get(p.user_id) as { display_name?: string; username?: string } | undefined)
              ?.display_name ?? p.user_id.slice(0, 6);
        else p.display = p.guest_name ?? "Guest";
      });
    } else {
      parr.forEach((p) => (p.display = p.guest_name ?? "Guest"));
    }
    const queuedRows = await getQueuedItems(roundId);
    if (request !== liveRequest.current) return;
    setPlayers(parr);
    // The durable device edit takes precedence until its exact revision syncs.
    const cardIds = new Set(parr.map(p => p.id));
    setScores(mergeQueuedScores((sc as Score[]) ?? [], queuedRows.filter(row => cardIds.has(row.round_player_id))));
    setConfirmations((cf as Confirmation[]) ?? []);
  }, [roundId]);

  /**
   * Static slice: the round itself, its course, hole layout, mapped design
   * features, and current weather. Read once per round, then left alone.
   */
  const loadStatic = useCallback(async () => {
    const { data: r, error: roundErr } = await supabase
      .from("rounds")
      .select(ROUND_COLUMNS)
      .eq("id", roundId)
      .maybeSingle();
    if (roundErr) throw new Error(roundErr.message);
    if (!r) throw new Error("We couldn't find this round.");
    const rd = r as unknown as Round;
    setRound(rd);
    setRoundStatusForWalk(rd.status);

    const [{ data: c }, { data: hs }] = await Promise.all([
      supabase
        .from("courses")
        .select("name, latitude, longitude")
        .eq("id", rd.course_id)
        .maybeSingle(),
      supabase
        .from("holes")
        .select(
          "number, par, par_confirmed, distance_ft, nickname, map_snapshot_path, tee_lat, tee_lng, basket_lat, basket_lng, elevation_ft",
        )
        .eq("layout_id", rd.layout_id)
        .order("number"),
    ]);

    const course = c as { name: string; latitude: number | null; longitude: number | null } | null;
    setCourseName(course?.name ?? "");

    const hArr = (hs as Hole[]) ?? [];
    const withPath = hArr.filter((h) => h.map_snapshot_path);
    if (withPath.length) {
      const signed = await Promise.all(
        withPath.map(async (h) => {
          const { data } = await supabase.storage
            .from("hole-media")
            .createSignedUrl(h.map_snapshot_path!, 3600);
          return { n: h.number, url: data?.signedUrl ?? null };
        }),
      );
      const m = new Map(signed.map((s) => [s.n, s.url]));
      hArr.forEach((h) => {
        if (m.has(h.number)) h.map_snapshot_url = m.get(h.number) ?? null;
      });
    }
    setHoles(hArr);

    // Mapped design features from the Course Builder, bounded to the holes in play.
    if (rd.layout_id) {
      const holeNumbers = hArr.map((h) => h.number);
      let featureQuery = supabase
        .from("course_features")
        .select("type, hole_number, hole_numbers")
        .eq("layout_id", rd.layout_id)
        .neq("publish_state", "draft")
        .neq("layer", "event");
      if (holeNumbers.length) {
        featureQuery = featureQuery.or(
          `hole_number.in.(${holeNumbers.join(",")}),hole_numbers.ov.{${holeNumbers.join(",")}}`,
        );
      }
      const { data: base } = await featureQuery.limit(600);
      // Event-only rules come from the snapshot frozen when the event round started.
      const snapRules = ((rd as { event_snapshot?: { event_rules?: unknown } }).event_snapshot
        ?.event_rules ?? []) as { type: string; hole_number: number | null; hole_numbers: number[] | null }[];
      const fs = [...(base ?? []), ...(Array.isArray(snapRules) ? snapRules : [])];
      const byHole = new Map<number, string[]>();
      for (const f of (fs as
        | { type: string; hole_number: number | null; hole_numbers: number[] | null }[]
        | null) ?? []) {
        const nums = f.hole_numbers?.length
          ? f.hole_numbers
          : f.hole_number != null
            ? [f.hole_number]
            : [];
        for (const n of nums) byHole.set(n, [...(byHole.get(n) ?? []), f.type]);
      }
      setHoleFeatures(
        new Map([...byHole.entries()].map(([n, types]) => [n, describeMappedFeatures(types)])),
      );
    }

    // Weather is optional and only fetched once per round.
    if (course?.latitude && course?.longitude) {
      try {
        const w = await fetchWeather({
          data: { latitude: course.latitude, longitude: course.longitude },
        });
        const parsed = parseCurrent(w as Parameters<typeof parseCurrent>[0]);
        if (parsed) setWeather(parsed);
      } catch {
        // Weather is optional.
      }
    }
  }, [roundId, fetchWeather]);

  /** Full refresh used on mount and by the Retry action. */
  const load = useCallback(async () => {
    setLoadError(null);
    setLoadingCard(true);
    try {
      await Promise.all([loadStatic(), loadLive()]);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "We couldn't load this round. Check your connection.",
      );
    } finally {
      setLoadingCard(false);
    }
  }, [loadStatic, loadLive]);

  useEffect(() => {
    void load();
    // Flush any offline scores queued from a previous session.
    void syncOfflineQueue().then(() => loadLive()).catch(() => { /* Keep current scores when disconnected. */ });
    // Coalesce bursts of realtime pushes into a single live refresh.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const queueLive = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void loadLive().catch(() => { /* A failed refresh must not erase the card. */ });
      }, 250);
    };
    const ch = supabase
      .channel(`round-${roundId}-${channelNonce()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_scores", filter: `round_id=eq.${roundId}` },
        queueLive,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "round_score_confirmations",
          filter: `round_id=eq.${roundId}`,
        },
        queueLive,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "round_players", filter: `round_id=eq.${roundId}` },
        queueLive,
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rounds", filter: `id=eq.${roundId}` }, payload => {
        const status = (payload.new as { status?: Round["status"] }).status;
        if (status === "in_progress" || status === "completed" || status === "abandoned") {
          setRound(previous => previous ? { ...previous, status } : previous);
          setRoundStatusForWalk(status);
        }
      })
      .subscribe(status => { if (status === "SUBSCRIBED") queueLive(); });
    // Recover missed pushes after reconnects and when returning to the app.
    const onVisible = () => { if (document.visibilityState === "visible") queueLive(); };
    const onOnline = () => {
      void syncOfflineQueue().then(queueLive).catch(queueLive);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ++liveRequest.current;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, loadLive]);

  /**
   * Score-variance alerts. When a cardmate edits a hole the whole card had
   * already confirmed, the database notifies every other player. Surface that
   * immediately while scoring so nobody submits a card that no longer matches.
   */
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const ch = supabase
      .channel(`round-variance-${roundId}-${channelNonce()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as {
            type?: string;
            data?: { round_id?: string; body?: string; title?: string } | null;
          };
          if (row?.type !== "score_change") return;
          if (row.data?.round_id && row.data.round_id !== roundId) return;
          toast.warning(row.data?.title ?? "Score variance on this card", {
            description: row.data?.body ?? "A cardmate changed a confirmed score.",
            duration: 10000,
          });
          void loadLive();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roundId, user?.id, loadLive]);

  /**
   * Full screen is a remembered preference, not a surprise. Body scroll stays
   * locked either way so the card never scrolls behind the fixed shell.
   */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        localStorage.setItem(FULLSCREEN_KEY, "0");
      } else if (document.fullscreenEnabled) {
        // Fullscreen the document root, not the scoring container: dialogs
        // portal to <body> and would otherwise render behind the backdrop.
        await document.documentElement.requestFullscreen();
        localStorage.setItem(FULLSCREEN_KEY, "1");
      } else {
        toast.info("This browser doesn't support full screen.");
      }
    } catch {
      toast.info("Full screen isn't available here.");
    }
  }, []);

  // Restore the remembered preference on the player's first tap.
  useEffect(() => {
    if (localStorage.getItem(FULLSCREEN_KEY) !== "1") return;
    const onFirstInteract = () => {
      if (!document.fullscreenElement) void toggleFullscreen();
    };
    window.addEventListener("pointerdown", onFirstInteract, { once: true });
    return () => window.removeEventListener("pointerdown", onFirstInteract);
  }, [toggleFullscreen]);

  // Load event leaderboard (tournament or league) if this round is linked to one.
  const fetchEventLeaderboard = useServerFn(getRoundEventLeaderboard);

  /** Event standings across every card, aggregated server-side. */
  const loadEvent = useCallback(async () => {
    if (!round) return;
    if (!round.tournament_id && !round.league_event_id) {
      setEventInfo(null);
      return;
    }
    try {
      const result = await fetchEventLeaderboard({ data: { roundId: round.id } });
      setEventInfo(result as EventInfo | null);
    } catch {
      // Standings are supplementary; leave the previous view in place.
    }
  }, [round, fetchEventLeaderboard]);

  useEffect(() => {
    if (!round) return;
    void loadEvent();
    if (!round.tournament_id && !round.league_event_id) return;
    // Subscribe to sibling round updates.
    const filter = round.tournament_id
      ? `tournament_id=eq.${round.tournament_id}`
      : `league_event_id=eq.${round.league_event_id}`;
    const ch = supabase
      .channel(`event-${round.tournament_id ?? round.league_event_id}-${channelNonce()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter }, () => {
        void loadEvent();
      })
      .subscribe();
    // Also poll every 30s in case sibling round_scores update (RLS-safe).
    const iv = window.setInterval(() => {
      void loadEvent();
    }, 30000);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(iv);
    };
  }, [round, loadEvent]);

  const isCreator = user?.id === round?.created_by;
  const activeHoleIndex = Math.max(
    0,
    holes.findIndex((h) => h.number === activeHole),
  );
  const currentHole = holes[activeHoleIndex] ?? holes[0];
  const par = currentHole?.par ?? 3;

  function scoreFor(playerId: string, hole: number) {
    return scores.find((s) => s.round_player_id === playerId && s.hole_number === hole);
  }
  // Any signed-in card-mate (a round_player linked to the current user) can keep scores for the whole card.
  const iAmOnCard = !!(user && players.some((p) => p.user_id === user.id));
  function canEditPlayer(_p: Player) {
    if (round?.status !== "in_progress") return false;
    if (isCreator) return true;
    return iAmOnCard;
  }

  const myPlayer = players.find((p) => user && p.user_id === user.id);
  const myStrokes = myPlayer ? (pending[`${myPlayer.id}:${activeHole}`] ?? par) : par;
  const [holeStats, setHoleStats] = useState<
    import("@/components/gps-hole-tracker").HoleShotStats | null
  >(null);
  useEffect(() => {
    setHoleStats(null);
  }, [activeHole]);

  const teePoint = useMemo(
    () =>
      currentHole?.tee_lat != null && currentHole?.tee_lng != null
        ? { latitude: currentHole.tee_lat, longitude: currentHole.tee_lng }
        : null,
    [currentHole?.tee_lat, currentHole?.tee_lng],
  );
  const basketPoint = useMemo(
    () =>
      currentHole?.basket_lat != null && currentHole?.basket_lng != null
        ? { latitude: currentHole.basket_lat, longitude: currentHole.basket_lng }
        : null,
    [currentHole?.basket_lat, currentHole?.basket_lng],
  );

  const resumedRef = useRef(false);
  useEffect(() => {
    if (!holes.length) return;
    // Honor a preselected starting hole from the pre-round setup (once per round).
    try {
      const key = `round:${roundId}:startingHole`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && holes.some((h) => h.number === n)) {
          setActiveHole(n);
          sessionStorage.removeItem(key);
          return;
        }
        sessionStorage.removeItem(key);
      }
      // Resume protection: return the player to the hole they left off on.
      if (!resumedRef.current) {
        resumedRef.current = true;
        const last = Number(localStorage.getItem(`round:${roundId}:lastHole`));
        if (Number.isFinite(last) && last > 0 && holes.some((h) => h.number === last)) {
          setActiveHole(last);
          return;
        }
      }
    } catch {
      // storage unavailable — fall through
    }
    if (!holes.some((h) => h.number === activeHole)) {
      setActiveHole(holes[0].number);
    }
  }, [holes, activeHole, roundId]);

  // Remember the current hole so a refresh, crash, or app switch resumes in place.
  useEffect(() => {
    if (!holes.length) return;
    try {
      localStorage.setItem(`round:${roundId}:lastHole`, String(activeHole));
    } catch {
      // storage unavailable — resume is best-effort
    }
  }, [activeHole, holes.length, roundId]);

  // Warn before leaving with unsaved strokes on the current hole.
  const hasUnsavedEdits = useMemo(
    () =>
      players.some((p) => {
        const saved = scoreFor(p.id, activeHole);
        const value = pending[`${p.id}:${activeHole}`];
        return dirtyScores.current.has(`${p.id}:${activeHole}`) && value != null && saved?.strokes !== value;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, pending, activeHole, scores],
  );
  useEffect(() => {
    if (!hasUnsavedEdits) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedEdits]);

  // Cardmate corrections update untouched controls; local edits stay in place.
  useEffect(() => {
    if (!currentHole) return;
    setPending(prev => reconcileScoringDrafts(prev, dirtyScores.current, scores, players.map(p => p.id), activeHole, par));
  }, [activeHole, players, currentHole, par, scores]);

  function bumpPending(playerId: string, delta: number) {
    const key = `${playerId}:${activeHole}`;
    dirtyScores.current.add(key);
    setPending((prev) => ({ ...prev, [key]: Math.max(1, (prev[key] ?? par) + delta) }));
  }
  function setPendingValue(playerId: string, value: number) {
    const key = `${playerId}:${activeHole}`;
    dirtyScores.current.add(key);
    setPending((prev) => ({ ...prev, [key]: Math.max(1, value) }));
  }

  // Layout calibration for the Projected DGD Round Rating (null when uncalibrated).
  const layoutCal = useQuery({
    queryKey: ["layout-calibration", round?.layout_id ?? null],
    enabled: !!round?.layout_id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("course_layouts")
        .select("scratch_rating, stroke_value")
        .eq("id", round!.layout_id!)
        .maybeSingle();
      const d = data as { scratch_rating: number | null; stroke_value: number | null } | null;
      return { scratch_rating: d?.scratch_rating ?? null, stroke_value: d?.stroke_value != null ? Number(d.stroke_value) : null };
    },
  });

  // Running totals and the next hole still missing a score, for the pace line.
  const myTotals = useMemo(
    () => playerRunningTotals(holes, scores, myPlayer?.id ?? null),
    [holes, scores, myPlayer?.id],
  );
  const nextUnscoredHole = useMemo(
    () => firstUnscoredHole(holes, scores, myPlayer?.id ?? null),
    [holes, scores, myPlayer?.id],
  );

  const [savingHole, setSavingHole] = useState(false);
  const [queued, setQueued] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const n = await getQueuedCount(roundId);
        if (!cancelled) setQueued(n);
      } catch {
        /* queue store unavailable */
      }
    };
    void refresh();
    const iv = window.setInterval(refresh, 4000);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [roundId]);
  const syncStatus: import("@/components/mobile/sync-status-chip").SyncStatus = savingHole
    ? "syncing"
    : queued > 0
      ? "waiting"
      : !isOnline
        ? "saved"
        : "synced";
  const syncLabel = queued > 0 ? `${queued} pending` : !isOnline ? "Offline" : undefined;

  /**
   * Hole geometry (which way the tee faces), wind resolved along the tee→basket
   * line, and the hole's elevation change — so the caddy shows what the hole is
   * actually playing instead of the sign distance.
   */
  const caddyWind = useMemo(() => {
    const elevationFt = currentHole?.elevation_ft ?? null;
    const dist = currentHole?.distance_ft ?? null;
    const teeLat = currentHole?.tee_lat;
    const teeLng = currentHole?.tee_lng;
    const basketLat = currentHole?.basket_lat;
    const basketLng = currentHole?.basket_lng;
    const hasLine = teeLat != null && teeLng != null && basketLat != null && basketLng != null;
    const bearing = hasLine
      ? bearingBetween(
          { latitude: teeLat, longitude: teeLng },
          { latitude: basketLat, longitude: basketLng },
        )
      : null;
    const effect = windEffect({
      speedMph: weather?.wind ?? null,
      fromDeg: weather?.windDir ?? null,
      holeBearingDeg: bearing,
    });
    return {
      playsLikeFt: holePlaysLikeFt(dist, effect?.alongMph ?? null, elevationFt),
      windNote: effect?.label ?? null,
      shapeNote: shapeAdvice(effect),
      facingNote: teeFacingNote(bearing),
      windFromNote: windFromNote(weather?.windDir ?? null, weather?.wind ?? null),
      elevationFt,
      elevationNote: elevationNote(elevationFt, effect?.alongMph ?? null),
      bearing,
    };
  }, [
    currentHole?.tee_lat,
    currentHole?.tee_lng,
    currentHole?.basket_lat,
    currentHole?.basket_lng,
    currentHole?.distance_ft,
    currentHole?.elevation_ft,
    weather?.wind,
    weather?.windDir,
  ]);

  const goToHoleByOffset = (offset: -1 | 1) => {
    if (!holes.length) return;
    const nextIndex = Math.min(holes.length - 1, Math.max(0, activeHoleIndex + offset));
    if (nextIndex === activeHoleIndex) return;
    tapHaptic(10);
    setActiveHole(holes[nextIndex].number);
  };

  // Screens must not sleep mid-round; players glance at the card between shots.
  useWakeLock(true);

  // Keyboard scoring for desktop cards: digits set your strokes, +/- nudge,
  // arrows change hole, Enter confirms, and "u" jumps to your first open hole.
  useScoringKeyboard({
    enabled: !!myPlayer && !savingHole && round?.status === "in_progress",
    onSetStrokes: (strokes) => {
      if (myPlayer) setPendingValue(myPlayer.id, strokes);
    },
    onBump: (delta) => {
      if (myPlayer) bumpPending(myPlayer.id, delta);
    },
    onNavigate: (delta) => goToHoleByOffset(delta),
    onConfirm: () => {
      void confirmHole();
    },
    onJumpToUnscored: () => {
      if (nextUnscoredHole != null) setActiveHole(nextUnscoredHole);
    },
  });

  // Outdoor (bright sunlight) mode: high-contrast surfaces, no translucency.
  const [outdoorMode, setOutdoorMode] = useState(false);
  useEffect(() => {
    try {
      setOutdoorMode(localStorage.getItem("scoring:outdoorMode") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleOutdoorMode = useCallback(() => {
    setOutdoorMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("scoring:outdoorMode", next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      toast.success(next ? "Outdoor mode on" : "Outdoor mode off");
      return next;
    });
  }, []);

  // Swipe left/right anywhere on the scoring surface to change holes.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchStart.current;
    const t = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Don't let a stray swipe walk away from scores that were changed but not submitted.
    const unsaved = players.some((p) => {
      const v = pending[`${p.id}:${activeHole}`];
      if (v == null) return false;
      const saved = scores.find((s) => s.round_player_id === p.id && s.hole_number === activeHole);
      return dirtyScores.current.has(`${p.id}:${activeHole}`) && (!saved || saved.strokes !== v);
    });
    if (unsaved) {
      toast.message("You have an unsubmitted score on this hole", {
        description: "Tap Submit to save it, or use the arrows to leave without saving.",
      });
      return;
    }
    goToHoleByOffset(dx < 0 ? 1 : -1);
  };

  // Full-round scorecard sheet (opened from the round menu).
  const [showScorecard, setShowScorecard] = useState(false);
  const scorecardMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of scores) map.set(`${s.round_player_id}:${s.hole_number}`, s.strokes);
    return map;
  }, [scores]);
  // Cells a cardmate confirmed with a different stroke count than what is saved.
  const conflictKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of confirmations) {
      const key = `${c.round_player_id}:${c.hole_number}`;
      const saved = scorecardMap.get(key);
      if (saved != null && saved !== c.strokes) set.add(key);
    }
    return set;
  }, [confirmations, scorecardMap]);

  /** Correct a single already-played score from the scorecard grid. */
  const saveOneScore = useCallback(
    async (playerId: string, hole: number, strokes: number) => {
      ++liveRequest.current;
      const result = await upsertScoresWithOfflineFallback([
        { round_id: roundId, round_player_id: playerId, hole_number: hole, strokes },
      ]);
      if (!result.synced && !result.queued) {
        toast.error(result.error ?? "We couldn't save that score. Try again.");
        return;
      }
      ++liveRequest.current;
      setScores((prev) => {
        const next = [...prev];
        const idx = next.findIndex((s) => s.round_player_id === playerId && s.hole_number === hole);
        if (idx === -1) next.push({ round_player_id: playerId, hole_number: hole, strokes });
        else next[idx] = { ...next[idx], strokes };
        return next;
      });
      setPending((prev) => ({ ...prev, [`${playerId}:${hole}`]: strokes }));
      dirtyScores.current.delete(`${playerId}:${hole}`);
      if (result.synced) {
        await supabase
          .from("round_score_confirmations")
          .delete()
          .eq("round_id", roundId)
          .eq("hole_number", hole)
          .eq("round_player_id", playerId);
        setConfirmations((prev) =>
          prev.filter((c) => !(c.hole_number === hole && c.round_player_id === playerId)),
        );
        toast.success(`Hole ${hole} updated`);
      } else {
        toast.message(`Saved offline · ${result.queued} pending`);
      }
    },
    [roundId],
  );

  async function confirmHole() {
    if (!currentHole || savingHole) return;
    const rows = players
      .filter((p) => canEditPlayer(p))
      .map((p) => {
        const key = `${p.id}:${activeHole}`;
        const strokes = pending[key] ?? par;
        const isMe = myPlayer && p.id === myPlayer.id;
        const attach = isMe && holeStats && holeStats.throws === strokes;
        return {
          round_id: roundId,
          round_player_id: p.id,
          hole_number: activeHole,
          strokes,
          ...(attach && holeStats
            ? {
                c1_putts: holeStats.c1_putts,
                c2_putts: holeStats.c2_putts,
                throw_in_ft: holeStats.throw_in_ft,
                longest_throw_ft: holeStats.longest_throw_ft,
                drive_distance_ft: holeStats.drive_ft,
                ob_strokes: holeStats.ob_strokes,
                penalties: holeStats.penalties,
              }
            : {}),
        };
      });
    if (!rows.length) {
      toast.error("You are not on this card", {
        description: "Only the round creator or a cardmate can save scores.",
      });
      return;
    }

    setSavingHole(true);
    try {
      // Detect which rows actually changed strokes vs the last saved value —
      // only changed rows should invalidate cardmate confirmations.
      const changedPlayerIds: string[] = [];
      for (const r of rows) {
        const existing = scores.find(
          (s) => s.round_player_id === r.round_player_id && s.hole_number === r.hole_number,
        );
        if (!existing || existing.strokes !== r.strokes) changedPlayerIds.push(r.round_player_id);
      }

      const result = await upsertScoresWithOfflineFallback(rows);
      if (!result.synced && !result.queued) {
        throw new Error(result.error ?? "Save failed");
      }
      ++liveRequest.current;

      // Optimistic local update — mirror what the server will hold once flushed.
      for (const row of rows) dirtyScores.current.delete(`${row.round_player_id}:${row.hole_number}`);
      setScores((prev) => {
        const next = [...prev];
        for (const r of rows) {
          const idx = next.findIndex(
            (s) => s.round_player_id === r.round_player_id && s.hole_number === r.hole_number,
          );
          if (idx === -1)
            next.push({
              round_player_id: r.round_player_id,
              hole_number: r.hole_number,
              strokes: r.strokes,
            });
          else next[idx] = { ...next[idx], strokes: r.strokes };
        }
        return next;
      });

      // Wipe stale confirmations for any player whose strokes changed on this hole.
      if (changedPlayerIds.length && result.synced) {
        await supabase
          .from("round_score_confirmations")
          .delete()
          .eq("round_id", roundId)
          .eq("hole_number", activeHole)
          .in("round_player_id", changedPlayerIds);
        setConfirmations((prev) =>
          prev.filter(
            (c) => !(c.hole_number === activeHole && changedPlayerIds.includes(c.round_player_id)),
          ),
        );
      }

      if (!result.synced) {
        toast.message(`Saved offline · ${result.queued} pending`, {
          description: "We'll sync automatically when you're back online.",
        });
      }

      // Celebrate smart-stat highlights for the logged-in player (only when online-synced).
      if (result.synced && holeStats?.throw_in_ft && holeStats.throw_in_ft >= 34) {
        toast.success(`🎯 Throw-in from ${holeStats.throw_in_ft} ft!`, {
          description: "Achievement unlocked — check your profile.",
        });
      }
      if (result.synced && holeStats?.longest_throw_ft && holeStats.longest_throw_ft >= 300) {
        toast.success(`💪 Big arm: ${holeStats.longest_throw_ft} ft throw`);
      }

      if (isLast) {
        if (isCreator) setConfirmFinish(true);
        else toast.success(result.synced ? "Hole saved" : "Hole saved offline");
        return;
      }

      const nextHole = holes[activeHoleIndex + 1];
      if (nextHole) setActiveHole(nextHole.number);
    } catch (e) {
      toast.error("Couldn't save this hole", { description: (e as Error).message });
      return;
    } finally {
      setSavingHole(false);
    }
  }

  async function addGuest() {
    if (!isCreator || !guestName.trim()) return;
    const { error } = await supabase.from("round_players").insert({
      round_id: roundId,
      guest_name: guestName.trim(),
      position: players.length,
    });
    if (error) return toast.error(error.message);
    setGuestName("");
  }

  async function removePlayer(id: string) {
    if (!isCreator) return;
    if (players.length <= 1) return toast.error("Round needs at least one player");
    await supabase.from("round_players").delete().eq("id", id);
  }

  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareVisibility, setShareVisibility] = useState<ShareVisibility>("friends");
  const [shareTagIds, setShareTagIds] = useState<string[]>([]);
  const [finishedSummary, setFinishedSummary] = useState<{
    myTotal: number;
    myToPar: number;
    myRating: number | null;
    holes: number;
    myPlayerId?: string | null;
  } | null>(null);

  /** Signed-in cardmates (excluding me) — pre-selected as tag suggestions. */
  const cardmateUserIds = useMemo(
    () => players.map((p) => p.user_id).filter((id): id is string => !!id && id !== user?.id),
    [players, user?.id],
  );

  useEffect(() => {
    if (shareOpen) setShareTagIds((prev) => (prev.length ? prev : cardmateUserIds));
  }, [shareOpen, cardmateUserIds]);

  /** Recap shown in the share sheet, mirroring what lands in the feed. */
  const shareSummary = useMemo<RoundShareSummary | null>(() => {
    if (!finishedSummary) return null;
    const parByHole = new Map(holes.map((h) => [h.number, h.par]));
    const mine = finishedSummary.myPlayerId
      ? scores.filter((s) => s.round_player_id === finishedSummary.myPlayerId)
      : [];
    let birdies = 0;
    let best: { number: number; to_par: number } | null = null;
    for (const s of mine) {
      const rel = s.strokes - (parByHole.get(s.hole_number) ?? 3);
      if (rel <= -1) birdies++;
      if (!best || rel < best.to_par) best = { number: s.hole_number, to_par: rel };
    }
    return {
      courseName: courseName || null,
      total: finishedSummary.myTotal,
      toPar: finishedSummary.myToPar,
      holes: finishedSummary.holes,
      rating: finishedSummary.myRating,
      birdies,
      bestHole: best,
    };
  }, [finishedSummary, scores, holes, courseName]);

  async function finish() {
    if (!isCreator || finishing || savingHole) return;
    if (Object.entries(pending).some(([key, value]) => dirtyScores.current.has(key) && scorecardMap.get(key) !== value)) {
      toast.error("Submit your edited scores before finishing this round.");
      return;
    }
    setFinishing(true);
    try {
      // Do not lock a round while this device still has unsent score edits.
      await syncOfflineQueue();
      if ((await getQueuedItems(roundId, true)).length) {
        throw new Error("Scores are still waiting to sync. Reconnect and sync before finishing this round.");
      }
      const [finalScores, finalConfirmations] = await Promise.all([
        supabase.from("round_scores").select("round_player_id, hole_number, strokes").eq("round_id", roundId),
        supabase.from("round_score_confirmations").select("round_player_id, hole_number, confirmed_by, strokes").eq("round_id", roundId),
      ]);
      if (finalScores.error || finalConfirmations.error) throw new Error("Couldn't verify the saved scorecard. Retry before finishing.");
      const finishScores = finalScores.data as Score[];
      const finishConfirmations = finalConfirmations.data as Confirmation[];
      setScores(finishScores); setConfirmations(finishConfirmations);
      const { data: layout } = await supabase
        .from("course_layouts")
        .select("scratch_rating, stroke_value")
        .eq("id", round!.layout_id)
        .maybeSingle();
      const scratchRating = (layout as { scratch_rating?: number } | null)?.scratch_rating ?? 950;
      const strokeValue = Number((layout as { stroke_value?: number } | null)?.stroke_value ?? 10);
      const parTotal = holes.reduce((s, h) => s + h.par, 0);
      const layoutHoleCount = holes.length;

      const userIds = players.filter((p) => p.user_id).map((p) => p.user_id!) as string[];
      const pdgaMap = new Map<string, number | null>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, pdga_rating")
          .in("id", userIds);
        for (const p of (profs as { id: string; pdga_rating: number | null }[] | null) ?? []) {
          pdgaMap.set(p.id, p.pdga_rating);
        }
      }

      let mySummary: {
        myTotal: number;
        myToPar: number;
        myRating: number | null;
        holes: number;
        myPlayerId?: string | null;
      } | null = null;
      const rows = players
        .map((p) => {
          const playedNumbers = new Set(holes.map(h => h.number));
          const playerScores = finishScores.filter((s) => s.round_player_id === p.id && playedNumbers.has(s.hole_number));
          if (!playerScores.length) return null;
          const total = playerScores.reduce((s, x) => s + x.strokes, 0);
          const holesPlayed = playerScores.length;
          const proratedPar = playerRunningTotals(holes, playerScores, p.id).parThru;
          const scoreToPar = total - proratedPar;
          const rating = Math.round(scratchRating - scoreToPar * strokeValue);
          if (p.user_id && user && p.user_id === user.id) {
            mySummary = {
              myTotal: total,
              myToPar: scoreToPar,
              myRating: rating,
              holes: holesPlayed,
              myPlayerId: p.id,
            };
          }
          return {
            round_id: roundId,
            round_player_id: p.id,
            user_id: p.user_id ?? null,
            guest_name: p.user_id ? null : p.display,
            course_id: round!.course_id,
            layout_id: round!.layout_id,
            holes_played: holesPlayed,
            layout_hole_count: layoutHoleCount,
            total_strokes: total,
            par_total: proratedPar,
            score_to_par: scoreToPar,
            round_rating: rating,
            pdga_rating_at_time: p.user_id ? (pdgaMap.get(p.user_id) ?? null) : null,
            scratch_rating: scratchRating,
            stroke_value: strokeValue,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      // Rating gate: only insert round_ratings when the round opted in AND
      // the card meets the DGD sanctioned threshold AND every scoring player
      // finished every hole. Casual rounds and short cards are always saved
      // as unrated snapshots.
      const isRated = round?.is_rated !== false && round?.rating_mode !== "casual";
      const cardSize = players.length;
      const scoringPlayers = rows.filter(
        (r) => r.holes_played === layoutHoleCount && layoutHoleCount > 0,
      );
      const meetsThreshold = meetsSanctionedThreshold(cardSize, scoringPlayers.length);
      // Every recorded hole for every scoring player must have a confirmation
      // from at least one other cardmate matching the strokes on file.
      const otherConfirmed = (playerId: string, holeNumber: number, strokes: number) =>
        finishConfirmations.some(
          (c) =>
            c.round_player_id === playerId &&
            c.hole_number === holeNumber &&
            c.confirmed_by !== (players.find((p) => p.id === playerId)?.user_id ?? "") &&
            c.strokes === strokes,
        );
      const fullyVerified = scoringPlayers.filter((r) => {
        const ps = finishScores.filter((s) => s.round_player_id === r.round_player_id && holes.some(h => h.number === s.hole_number));
        return ps.every((s) => otherConfirmed(r.round_player_id, s.hole_number, s.strokes));
      });

      const verifiedRows = isRated && meetsThreshold ? fullyVerified : [];
      if (verifiedRows.length) {
        const { error: rerr } = await supabase
          .from("round_ratings")
          .upsert(verifiedRows, { onConflict: "round_id,round_player_id" });
        if (rerr) throw rerr;
      } else if (rows.length) {
        toast.message("Round saved without rating", {
          description: !isRated
            ? "Casual round — scores kept, no DGD rating recorded."
            : cardSize < 2
              ? "Solo rounds don't count toward DGD rating."
              : !meetsThreshold
                ? `Card needed ${requiredScorerCount(cardSize)} scoring players — recorded as casual.`
                : "Some holes weren't confirmed by a cardmate — recorded as casual.",
        });
      }

      const { error } = await supabase
        .from("rounds")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", roundId);
      if (error) throw error;

      toast.success(
        `Round submitted · ${rows.length} rating${rows.length === 1 ? "" : "s"} recorded`,
      );

      if (mySummary) {
        setFinishedSummary(mySummary);
        const sm = mySummary as {
          myTotal: number;
          myToPar: number;
          myRating: number | null;
          holes: number;
        };
        const parLabel =
          sm.myToPar === 0 ? "E" : sm.myToPar > 0 ? `+${sm.myToPar}` : `${sm.myToPar}`;
        setShareText(
          `Just finished ${sm.holes} holes at ${courseName || "the course"} — ${sm.myTotal} (${parLabel})` +
            (sm.myRating ? ` · round rating ${sm.myRating}` : "") +
            ". #discgolf",
        );
        setConfirmFinish(false);
        setShareOpen(true);
      } else {
        navigate({ to: "/play/$roundId/review", params: { roundId } });
      }
    } catch (e) {
      toast.error("We couldn't finish this round. Give it another shot.", {
        description: (e as Error).message,
      });
    } finally {
      setFinishing(false);
    }
  }

  async function shareRound() {
    if (!user || sharing) return;
    setSharing(true);
    try {
      // Build rich snapshot from my scores + shot stats
      const parByHole = new Map(holes.map((h) => [h.number, h.par]));
      const myPlayerId =
        finishedSummary?.myPlayerId ?? players.find((p) => p.user_id === user.id)?.id;
      const myScores = myPlayerId ? scores.filter((s) => s.round_player_id === myPlayerId) : [];
      let aces = 0,
        eagles = 0,
        birdies = 0,
        pars = 0,
        bogeys = 0,
        doublesPlus = 0;
      let best: { number: number; to_par: number } | null = null;
      let worst: { number: number; to_par: number } | null = null;
      for (const s of myScores) {
        const par = parByHole.get(s.hole_number) ?? 3;
        const rel = s.strokes - par;
        if (s.strokes === 1) aces++;
        else if (rel <= -2) eagles++;
        else if (rel === -1) birdies++;
        else if (rel === 0) pars++;
        else if (rel === 1) bogeys++;
        else if (rel >= 2) doublesPlus++;
        if (!best || rel < best.to_par) best = { number: s.hole_number, to_par: rel };
        if (!worst || rel > worst.to_par) worst = { number: s.hole_number, to_par: rel };
      }

      // Pull shot-level detail for C1/C2 putt %, longest drive
      let c1_putt_pct: number | null = null;
      let c2_putt_pct: number | null = null;
      let longest_drive_ft: number | null = null;
      if (myPlayerId) {
        const { data: rs } = await supabase
          .from("round_scores")
          .select(
            "c1_putts_made, c1_putts_missed, c2_putts_made, c2_putts_missed, drive_distance_ft, longest_throw_ft",
          )
          .eq("round_player_id", myPlayerId);
        if (rs && rs.length) {
          let c1m = 0,
            c1mi = 0,
            c2m = 0,
            c2mi = 0,
            ld = 0;
          for (const r of rs as Array<{
            c1_putts_made?: number | null;
            c1_putts_missed?: number | null;
            c2_putts_made?: number | null;
            c2_putts_missed?: number | null;
            drive_distance_ft?: number | null;
            longest_throw_ft?: number | null;
          }>) {
            c1m += r.c1_putts_made ?? 0;
            c1mi += r.c1_putts_missed ?? 0;
            c2m += r.c2_putts_made ?? 0;
            c2mi += r.c2_putts_missed ?? 0;
            const drive = Math.max(r.drive_distance_ft ?? 0, r.longest_throw_ft ?? 0);
            if (drive > ld) ld = drive;
          }
          if (c1m + c1mi > 0) c1_putt_pct = (c1m / (c1m + c1mi)) * 100;
          if (c2m + c2mi > 0) c2_putt_pct = (c2m / (c2m + c2mi)) * 100;
          if (ld > 0) longest_drive_ft = Math.round(ld);
        }
      }

      const snapshot = finishedSummary
        ? {
            course_name: courseName || null,
            holes: finishedSummary.holes,
            total: finishedSummary.myTotal,
            to_par: finishedSummary.myToPar,
            rating: finishedSummary.myRating,
            aces,
            eagles,
            birdies,
            pars,
            bogeys,
            doubles_plus: doublesPlus,
            c1_putt_pct,
            c2_putt_pct,
            longest_drive_ft,
            best_hole: best,
            worst_hole: worst,
          }
        : null;

      const { data: created, error } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          body: shareText.trim() || `Finished a round at ${courseName || "the course"}.`,
          type: "roundcard",
          course_name: courseName || null,
          round_id: roundId,
          visibility: shareVisibility,
          score_data: finishedSummary
            ? {
                total: finishedSummary.myTotal,
                to_par: finishedSummary.myToPar,
                rating: finishedSummary.myRating,
                holes: finishedSummary.holes,
              }
            : null,
          snapshot,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Tagging is server-validated (post ownership + accepted friendship), so a
      // failure here must not lose the already-published round card.
      if (created?.id && shareTagIds.length) {
        try {
          await tagPlayersOnPost({
            data: { postId: created.id, userIds: shareTagIds },
          });
        } catch (tagErr) {
          toast.message("Round posted, but tags didn't save", {
            description: (tagErr as Error).message,
          });
        }
      }
      toast.success("Round shared to your feed");
      navigate({ to: "/home" });
    } catch (e) {
      toast.error("Couldn't share round", { description: (e as Error).message });
    } finally {
      setSharing(false);
      setShareOpen(false);
    }
  }

  const totals = useMemo(() => {
    const parByHole = new Map(holes.map((h) => [h.number, h.par]));
    const map = new Map<string, { total: number; toPar: number; played: number }>();
    for (const p of players) map.set(p.id, { total: 0, toPar: 0, played: 0 });
    for (const s of scores) {
      const cur = map.get(s.round_player_id);
      if (!cur) continue;
      cur.total += s.strokes;
      cur.played += 1;
      cur.toPar += s.strokes - (parByHole.get(s.hole_number) ?? 3);
    }
    return map;
  }, [scores, players, holes]);

  function scoreClass(strokes: number, holePar: number) {
    const rel = strokes - holePar;
    if (rel < 0) return "text-primary";
    if (rel === 0) return "text-foreground";
    if (rel === 1) return "text-warning";
    return "text-destructive";
  }

  if (loadError)
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-40 grid place-items-center bg-background p-6"
      >
        <div className="max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">This card didn't load</h1>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <div className="flex justify-center gap-2">
            <Button
              onClick={() => {
                void load();
              }}
            >
              Try again
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/play" })}>
              Back to Play
            </Button>
          </div>
        </div>
      </div>
    );

  if (loadingCard || !round || !holes.length)
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-40 grid place-items-center bg-background text-muted-foreground"
      >
        Loading round…
      </div>
    );

  const isLast = activeHoleIndex >= holes.length - 1;
  const orderedPlayers = [...players].sort((a, b) => {
    const aMe = !!(user && a.user_id === user.id);
    const bMe = !!(user && b.user_id === user.id);
    return aMe === bMe ? 0 : aMe ? -1 : 1;
  });
  const currentPlayerId =
    activePlayerId && players.some((p) => p.id === activePlayerId)
      ? activePlayerId
      : (orderedPlayers[0]?.id ?? null);
  const editableOrder = orderedPlayers.filter((p) => canEditPlayer(p));
  const curIdx = editableOrder.findIndex((p) => p.id === currentPlayerId);
  const nextEditablePlayerId =
    curIdx >= 0 && curIdx < editableOrder.length - 1 ? editableOrder[curIdx + 1].id : null;

  return (
    <div
      ref={containerRef}
      data-outdoor={outdoorMode ? "true" : undefined}
      className="fixed inset-0 z-40 flex h-screen w-screen flex-col bg-background text-foreground"
    >
      {/* Top bar — Round Companion header */}
      <RoundHeader
        courseName={courseName}
        layoutName={undefined}
        format={round ? formatRoundPlayLine(round) : undefined}
        holeCurrent={activeHole}
        holeTotal={holes.length}
        eventName={eventInfo?.name}
        syncStatus={syncStatus}
        syncLabel={syncLabel}
        holeInfo={[
          currentHole?.par != null
            ? `Par ${currentHole.par}${(currentHole as { par_confirmed?: boolean }).par_confirmed === false ? " (not confirmed)" : ""}`
            : null,
          currentHole?.distance_ft ? `${currentHole.distance_ft} ft` : null,
        ].filter(Boolean).join(" · ") || undefined}
        onExit={() => {
          // Once the card is committed to a rated round (2+ players scored hole 1),
          // bailing counts as an abandonment penalty. Warn before we walk away.
          const hole1 = holes[0]?.number ?? 1;
          const hole1ScorerCount = players.filter((p) =>
            scores.some((s) => s.round_player_id === p.id && s.hole_number === hole1),
          ).length;
          const committed =
            round?.is_rated !== false &&
            round?.rating_mode !== "casual" &&
            isRoundCommitted(hole1ScorerCount) &&
            round?.status === "in_progress";
          if (committed) setConfirmExit(true);
          else navigate({ to: "/play" });
        }}
        onOpenScorecard={() => setShowScorecard(true)}
        onFinish={isCreator ? () => setConfirmFinish(true) : undefined}
        canFinish={isCreator && !finishing}
        overflow={[
          ...(isPhone
            ? []
            : [
                {
                  label: fullscreen ? "Exit full screen" : "Full screen",
                  icon: fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />,
                  onSelect: () => {
                    void toggleFullscreen();
                  },
                },
              ]),
          {
            label: "Hole details",
            icon: <BookOpen className="h-4 w-4" />,
            onSelect: () => openTool("hole"),
          },
          {
            label: "Throw history",
            icon: <Crosshair className="h-4 w-4" />,
            onSelect: () => openTool("shots"),
          },
          {
            label: "Round settings",
            icon: <UserPlus className="h-4 w-4" />,
            onSelect: () => setShowManage(true),
          },
          {
            label: "Rulebook",
            icon: <BookOpen className="h-4 w-4" />,
            onSelect: () => navigate({ to: "/rules" }),
          },
        ]}
      />
      <RoundGlanceStrip
        wind={weather?.wind ?? null}
        gust={weather?.gust ?? null}
        windFromDeg={weather?.windDir ?? null}
        windFromLabel={weather?.windDir != null ? windCompass(weather.windDir) : null}
        windNote={caddyWind.windNote}
        holeBearingDeg={caddyWind.bearing}
        elevationFt={caddyWind.elevationFt}
        walk={walk.enabled ? (walk.totals ?? { distance_m: 0, elevation_gain_m: 0, elevation_loss_m: 0, steps: 0, calories: 0 }) : null}
        onOpenWalk={() => setShowManage(true)}
      />

      {/* Body: hole layout + centered scoring on the left, caddy/GPS + leaderboards on the right */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden wide:grid-cols-[minmax(0,1fr)_minmax(240px,288px)] wide:grid-rows-1">
        {/* Main column: hole stage on top, scoring centered below */}
        <section
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="flex min-h-0 flex-col overflow-hidden border-b border-border bg-muted/20 wide:border-b-0 wide:border-r land:flex-row"
        >
          {/* HERO tee sign — Round Companion stage (main focus) */}
          <div className="relative min-h-0 flex-1 overflow-hidden p-2">
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex items-end justify-between gap-2 wide:hidden">
              <button
                type="button"
                onClick={() => openTool("card")}
                aria-label="Open card"
                className="pointer-events-auto min-h-11 rounded-full bg-background/85 px-3 text-sm font-semibold tabular-nums shadow-sm backdrop-blur"
              >
                {myPlayer && myTotals.thru > 0
                  ? `${formatToPar(myTotals.toPar)} · ${myTotals.strokes} strokes`
                  : "Card"}
              </button>
              <div className="flex gap-2">
                {round && gameModeFromRound(round).id !== "singles_stroke" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="pointer-events-auto min-h-11 rounded-full px-4 font-semibold shadow-sm"
                    onClick={() => openTool("game")}
                  >
                    Game
                  </Button>
                ) : null}
              </div>
            </div>
            <HoleStage
              holeNumber={activeHole}
              par={par}
              distanceFt={currentHole?.distance_ft ?? null}
              nickname={currentHole?.nickname ?? null}
              features={holeFeatures.get(activeHole) ?? []}
              imageUrl={currentHole?.map_snapshot_url ?? null}
              renderSign={round?.course_id ? (
                <Suspense fallback={<div role="status" className="grid h-full place-items-center p-4 text-center text-sm text-muted-foreground">Loading tee sign…</div>}>
                  <LazyTeeSign courseId={round.course_id} initialLayoutId={round.layout_id ?? undefined} embedHole={activeHole} />
                </Suspense>
              ) : undefined}
            />
            <RoundHeaderSlot>
              <Button type="button" variant="ghost" size="icon" aria-label="Caddy" title="Caddy"
                className="min-h-11 min-w-11" onClick={() => openTool("caddy")}>
                <SparklesIcon className="h-5 w-5" />
              </Button>
            </RoundHeaderSlot>
            {currentPlayerId ? (
              <RecordThrowSheet
                open={throwOpen}
                onOpenChange={setThrowOpen}
                roundId={roundId}
                roundPlayerId={currentPlayerId}
                playerName={players.find((p) => p.id === currentPlayerId)?.display ?? "Player"}
                holeNumber={activeHole}
                par={currentHole?.par ?? null}
                teePoint={teePoint}
                onHoledOut={(n) => {
                  const key = `${currentPlayerId}:${activeHole}`;
                  dirtyScores.current.add(key);
                  setPending((prev) => ({ ...prev, [key]: n }));
                  setTrackedScore((prev) => ({ ...prev, [key]: n }));
                }}
              />
            ) : null}
          </div>

          {/* Scoring panel — sizes to the card so every player fits without scrolling */}
          <div className="flex min-h-0 shrink-0 flex-col bg-background land:w-[min(360px,45vw)] land:overflow-y-auto land:border-l land:border-border">
            <div className="min-h-0 max-h-full overflow-y-auto p-2">
              <div
                className={
                  "mx-auto grid w-full gap-2 " +
                  (players.length > 4
                    ? "max-w-[1100px] grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                    : players.length > 2
                      ? "max-w-[900px] grid-cols-1 sm:grid-cols-2"
                      : "max-w-[720px] grid-cols-1")
                }
              >
                {round?.course_id && round.status === "in_progress" ? (
                  <CourseIssueRadar courseId={round.course_id} holeNumber={currentHole?.number ?? null} />
                ) : null}
                {myPlayer ? (
                  <div className="hidden sm:col-span-2 wide:block xl:col-span-full">
                    <RunningTotalLine
                      totals={myTotals}
                      totalHoles={holes.length}
                      layoutPar={holes.length ? holes.reduce((s, h) => s + h.par, 0) : null}
                      scratchRating={layoutCal.data?.scratch_rating ?? null}
                      strokeValue={layoutCal.data?.stroke_value ?? null}
                      nextUnscoredHole={nextUnscoredHole}
                      onJumpToUnscored={(hole) => setActiveHole(hole)}
                    />
                  </div>
                ) : null}
                {players.length > 1 ? (
                  <div className="flex gap-1.5 flex-wrap wide:hidden" role="tablist" aria-label="Choose player">
                    {orderedPlayers.map((p) => {
                      const saved = scoreFor(p.id, activeHole);
                      const on = p.id === currentPlayerId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => setActivePlayerId(p.id)}
                          className={
                            "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium " +
                            (on ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground")
                          }
                        >
                          <span className="max-w-[7rem] truncate">{p.display}</span>
                          <span className="tabular-nums font-semibold">{saved ? saved.strokes : "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {orderedPlayers
                  .map((p) => {
                    const key = `${p.id}:${activeHole}`;
                    const strokes = pending[key] ?? par;
                    const saved = scoreFor(p.id, activeHole);
                    const isDirty = !saved || saved.strokes !== strokes;
                    const editable = canEditPlayer(p);
                    const isMe = !!(user && p.user_id === user.id);
                    return (
                      <div
                        key={p.id}
                        className={
                          (p.id === currentPlayerId ? "" : "phone:hidden ") +
                          "rounded-xl border bg-card shadow-sm " +
                          (players.length > 2 ? "p-1.5 " : "p-2 ") +
                          (isMe ? "border-primary/50 ring-1 ring-primary/20" : "border-border")
                        }
                      >
                        <div
                          className={
                            (players.length > 2 ? "mb-1 " : "mb-2 ") +
                            "flex items-center justify-between gap-2"
                          }
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-semibold">{p.display}</div>
                            {isMe ? (
                              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                You
                              </span>
                            ) : null}
                            {!isDirty && saved ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                                <Check className="h-3 w-3" /> Saved
                              </span>
                            ) : null}
                          </div>
                          <div className={"text-xs font-medium " + scoreClass(strokes, par)}>
                            {scoreLabel(strokes, par)}
                          </div>
                        </div>
                        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
                          <span aria-hidden />
                          <div className="flex min-w-0 justify-center">
                        <ScoreDial
                          value={strokes}
                          par={par}
                          compact={players.length > 2}
                          disabled={!editable}
                          playerLabel={p.display}
                          onChange={(next) => {
                            tapHaptic(8);
                            setPendingValue(p.id, next);
                          }}
                        />
                          </div>
                          {round?.status === "in_progress" && editable && p.id === currentPlayerId ? (
                            <Button type="button" variant="outline" aria-label="Record throw"
                              className="h-auto min-h-14 w-14 flex-col gap-0.5 px-1 text-xs font-semibold"
                              onClick={() => setThrowOpen(true)}>
                              <CrosshairIcon className="h-5 w-5 text-primary" />
                              Throw
                            </Button>
                          ) : <span aria-hidden />}
                        </div>
                        {round?.is_rated && !isMe && saved && !isDirty
                          ? (() => {
                              const rowsForHole = confirmations.filter(
                                (c) => c.round_player_id === p.id && c.hole_number === activeHole,
                              );
                              const myConfirm = rowsForHole.find(
                                (c) => c.confirmed_by === (user?.id ?? ""),
                              );
                              const otherConfirms = rowsForHole.filter(
                                (c) => c.confirmed_by !== (user?.id ?? ""),
                              );
                              const conflict = rowsForHole.some((c) => c.strokes !== saved.strokes);
                              const confirmKey = `${p.id}:${activeHole}`;
                              // Most-claimed alternative stroke count, so the scorer can adopt it in one tap.
                              const tally = new Map<number, number>();
                              for (const c of rowsForHole) {
                                if (c.strokes === saved.strokes) continue;
                                tally.set(c.strokes, (tally.get(c.strokes) ?? 0) + 1);
                              }
                              const disputed = [...tally.entries()].sort(
                                (a, b) => b[1] - a[1] || a[0] - b[0],
                              )[0];
                              return (
                                <div
                                  className={
                                    "mt-2 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs " +
                                    (conflict
                                      ? "border-destructive/50 bg-destructive/10"
                                      : myConfirm
                                        ? "border-primary/40 bg-primary/5"
                                        : "border-border bg-background")
                                  }
                                >
                                  <span className="min-w-0 truncate">
                                    {conflict ? (
                                      <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Score conflict — {saved.strokes} on card
                                        {disputed ? `, ${disputed[0]} claimed` : ""}
                                      </span>
                                    ) : otherConfirms.length ? (
                                      <span className="text-muted-foreground">
                                        Confirmed by {otherConfirms.length} card
                                        {otherConfirms.length === 1 ? "mate" : "mates"}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        Awaiting cardmate confirm
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {conflict && disputed && editable ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => {
                                          tapHaptic(8);
                                          setPendingValue(p.id, disputed[0]);
                                          toast.info(`Set to ${disputed[0]} — save to resolve`);
                                        }}
                                      >
                                        Use {disputed[0]}
                                      </Button>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant={
                                        myConfirm && myConfirm.strokes === saved.strokes
                                          ? "outline"
                                          : "default"
                                      }
                                      disabled={confirmingKey === confirmKey || !user?.id}
                                      className="h-7 px-2 text-xs"
                                      onClick={async () => {
                                        if (!user?.id) return;
                                        setConfirmingKey(confirmKey);
                                        const row = {
                                          round_id: roundId,
                                          round_player_id: p.id,
                                          hole_number: activeHole,
                                          confirmed_by: user.id,
                                          strokes: saved.strokes,
                                        };
                                        const { error } = await supabase
                                          .from("round_score_confirmations")
                                          .upsert(row, {
                                            onConflict:
                                              "round_id,round_player_id,hole_number,confirmed_by",
                                          });
                                        setConfirmingKey(null);
                                        if (error) {
                                          toast.error("Couldn't confirm score", {
                                            description: error.message,
                                          });
                                          return;
                                        }
                                        setConfirmations((prev) => {
                                          const next = prev.filter(
                                            (c) =>
                                              !(
                                                c.round_player_id === row.round_player_id &&
                                                c.hole_number === row.hole_number &&
                                                c.confirmed_by === row.confirmed_by
                                              ),
                                          );
                                          next.push(row);
                                          return next;
                                        });
                                      }}
                                    >
                                      {myConfirm && myConfirm.strokes === saved.strokes
                                        ? "Confirmed"
                                        : conflict
                                          ? "Confirm correct"
                                          : "Confirm"}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })()
                          : null}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="flex shrink-0 flex-col justify-center border-t border-border bg-card p-3 wide:min-h-[120px] wide:p-4">
              <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-full wide:h-16 wide:w-16"
                    onClick={() => setActiveHole(Math.max(1, activeHole - 1))}
                    disabled={activeHole <= 1}
                    aria-label="Previous hole"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </Button>
                  <div className="font-display text-lg font-bold leading-none wide:text-2xl">
                    Hole {activeHole}
                    <span className="text-base font-medium text-muted-foreground">
                      {" "}
                      of {holes.length}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-full wide:h-16 wide:w-16"
                    onClick={() =>
                      setActiveHole(
                        Math.min(holes[holes.length - 1]?.number ?? activeHole, activeHole + 1),
                      )
                    }
                    disabled={activeHole >= (holes[holes.length - 1]?.number ?? activeHole)}
                    aria-label="Next hole"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </Button>
                </div>

                {(() => {
                  const hasPending = players.some((p) => {
                    const key = `${p.id}:${activeHole}`;
                    const strokes = pending[key] ?? par;
                    const saved = scoreFor(p.id, activeHole);
                    return !saved || saved.strokes !== strokes;
                  });
                  const allSaved =
                    !hasPending && players.every((p) => !!scoreFor(p.id, activeHole));
                  return (
                    <Button
                      size="lg"
                      className="min-h-14 w-full text-base font-semibold"
                      onClick={() => {
                        const ck = `${currentPlayerId}:${activeHole}`;
                        const tracked = trackedScore[ck];
                        const entered = pending[ck] ?? par;
                        if (tracked != null && tracked !== entered) {
                          setScoreCheck({ key: ck, tracked, entered });
                          return;
                        }
                        // Phone: one person keeps the card — step to the next editable player first.
                        if (isPhone && nextEditablePlayerId) {
                          tapHaptic(8);
                          setActivePlayerId(nextEditablePlayerId);
                          return;
                        }
                        void confirmHole();
                      }}
                      disabled={savingHole}
                      variant={allSaved && !isLast ? "secondary" : "default"}
                    >
                      <Check className="mr-2 h-5 w-5" />
                      {savingHole
                        ? "Saving…"
                        : isPhone && nextEditablePlayerId
                          ? `Next: ${players.find((x) => x.id === nextEditablePlayerId)?.display ?? "player"}`
                        : isLast
                          ? allSaved
                            ? "Finish round"
                            : "Submit & finish round"
                          : allSaved
                            ? "Next hole"
                            : "Submit & next"}
                    </Button>
                  );
                })()}
              </div>
            </div>
          </div>
        </section>

        {/* Right column: Always-on GPS shot marker, then Caddy / Card / Shots / Hole */}
        {toolsOpen ? (
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 bg-background/60 wide:hidden"
            onClick={() => setToolsOpen(false)}
          />
        ) : null}
        <aside
          className={
            "flex min-h-0 flex-col overflow-hidden bg-muted/20 p-2 " +
            "phone:fixed phone:inset-x-0 phone:bottom-0 phone:z-50 phone:h-[78vh] phone:rounded-t-2xl phone:border-t phone:border-border phone:bg-background phone:shadow-lg " +
            (toolsOpen ? "" : "phone:hidden")
          }
        >
          {/* Phone: each tool is its own sheet — no tab navigation while playing */}
          <div className="mb-2 flex items-center justify-between wide:hidden">
            <span className="text-base font-semibold">
              {{ caddy: "Caddy", card: "Card", game: "Game", shots: "Throw history", hole: `Hole ${activeHole} details` }[asideTab] ?? "Hole"}
            </span>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setToolsOpen(false)}>
              Done
            </Button>
          </div>
          {/* GPS shot marker — desktop only; on phones throws come from Record throw */}
          <div className={"mb-2 shrink-0 phone:hidden " + (asideTab === "shots" ? "" : "")}>
            <GpsHoleTracker
              holeNumber={activeHole}
              strokes={myStrokes}
              teePoint={teePoint}
              basketPoint={basketPoint}
              onStatsChange={setHoleStats}
            />
          </div>

          <Tabs
            value={asideTab}
            onValueChange={setAsideTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="flex h-auto w-full shrink-0 justify-start gap-1 flex-wrap phone:hidden sm:grid sm:grid-cols-5">
              <TabsTrigger value="caddy" className="shrink-0 whitespace-nowrap text-xs">
                Caddy
              </TabsTrigger>
              <TabsTrigger value="card" className="shrink-0 whitespace-nowrap text-xs">
                Card
              </TabsTrigger>
              <TabsTrigger value="game" className="shrink-0 whitespace-nowrap text-xs">
                Game
              </TabsTrigger>
              <TabsTrigger value="shots" className="shrink-0 whitespace-nowrap text-xs">
                Shots
              </TabsTrigger>
              <TabsTrigger value="hole" className="shrink-0 whitespace-nowrap text-xs">
                Hole
              </TabsTrigger>
            </TabsList>

            <TabsContent value="caddy" className="mt-2 flex-1 space-y-2 overflow-auto">
              <AcePanel
                userId={user?.id ?? null}
                holeNumber={activeHole}
                distanceFt={currentHole?.distance_ft ?? null}
                par={par}
                playsLikeFt={caddyWind.playsLikeFt}
                windNote={caddyWind.windNote}
                shapeNote={caddyWind.shapeNote}
                facingNote={caddyWind.facingNote}
                windFromNote={caddyWind.windFromNote}
                elevationFt={caddyWind.elevationFt}
                elevationNote={caddyWind.elevationNote}
              />
              <div className={round?.status === "in_progress" ? "phone:hidden" : ""}><HoleValueNote
                layoutId={round?.layout_id ?? null}
                holeNumber={activeHole}
                par={par}
              /></div>
            </TabsContent>

            <TabsContent value="card" className="mt-2 flex-1 space-y-2 overflow-auto">
              <div className="rounded-xl border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Trophy className="h-3 w-3" /> Your card
                  </span>
                  <span>Thru · Total · +/-</span>
                </div>
                <ul className="divide-y divide-border">
                  {[...players]
                    .sort((a, b) => (totals.get(a.id)?.toPar ?? 0) - (totals.get(b.id)?.toPar ?? 0))
                    .map((p, i) => {
                      const t = totals.get(p.id);
                      const rel = t?.toPar ?? 0;
                      const isMe = !!(user && p.user_id === user.id);
                      return (
                        <li
                          key={p.id}
                          className={
                            "flex items-center gap-3 px-3 py-1.5 text-sm " +
                            (isMe ? "bg-primary/5" : "")
                          }
                        >
                          <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                          <span className="flex-1 truncate">
                            {p.display}
                            {isMe ? (
                              <span className="ml-1 text-[10px] text-primary">YOU</span>
                            ) : null}
                          </span>
                          <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">
                            {t?.played ?? 0}
                          </span>
                          <span className="w-10 text-right tabular-nums font-semibold">
                            {t?.total ?? 0}
                          </span>
                          <span
                            className={
                              "w-10 text-right tabular-nums text-sm font-semibold " +
                              (rel < 0
                                ? "text-primary"
                                : rel > 0
                                  ? "text-destructive"
                                  : "text-muted-foreground")
                            }
                          >
                            {rel === 0 ? "E" : rel > 0 ? `+${rel}` : rel}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
              {round ? (
                <JoinCodePanel
                  scope={{
                    target_kind: "round",
                    round_id: round.id,
                    ...(round.course_id ? { course_id: round.course_id } : {}),
                    ...(round.layout_id ? { layout_id: round.layout_id } : {}),
                  }}
                  eventName={round ? gameModeFromRound(round).label : "Round"}
                  description="Share a code so anyone on the card can score from their own phone — text it, email it, or let them scan the QR. No account needed."
                />
              ) : null}

              {eventInfo ? (
                <LiveScoresPanel
                  eventKind={eventInfo.kind}
                  eventId={eventInfo.id}
                  eventName={eventInfo.name}
                  rows={eventInfo.rows}
                  totalHoles={holes.length || 18}
                />
              ) : null}
              <div className={round?.status === "in_progress" ? "phone:hidden" : ""}><RoundInsightsPanel
                meId={myPlayer?.id ?? null}
                scores={scores.map((s) => ({
                  playerId: s.round_player_id,
                  hole: s.hole_number,
                  strokes: s.strokes,
                }))}
                holes={holes.map((h) => ({ number: h.number, par: h.par }))}
              /></div>
              <div className={round?.status === "in_progress" ? "phone:hidden" : ""}><RoundRatingPanel
                layoutId={round?.layout_id ?? null}
                meId={myPlayer?.id ?? null}
                scores={scores.map((s) => ({
                  playerId: s.round_player_id,
                  hole: s.hole_number,
                  strokes: s.strokes,
                }))}
                holes={holes.map((h) => ({ number: h.number, par: h.par }))}
              /></div>
              <PaceTracker
                activeHole={activeHole}
                totalHoles={holes.length || 18}
                holesPlayed={myPlayer ? (totals.get(myPlayer.id)?.played ?? 0) : 0}
              />
            </TabsContent>

            <TabsContent value="game" className="mt-2 flex-1 space-y-2 overflow-auto">
              {round ? <GameSummaryPanel round={round} playerCount={players.length} /> : null}
              {round ? (
                <GameSettlementPanel
                  round={round}
                  players={players.map((p) => ({
                    id: p.id,
                    name: p.display ?? "Player",
                    isMe: !!(user && p.user_id === user.id),
                  }))}
                  scores={scores.map((s) => ({
                    playerId: s.round_player_id,
                    hole: s.hole_number,
                    strokes: s.strokes,
                  }))}
                  holes={holes.map((h) => h.number)}
                  pars={new Map(holes.map((h) => [h.number, h.par]))}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="shots" className="mt-2 flex-1 space-y-2 overflow-auto">
              <div className={round?.status === "in_progress" ? "phone:hidden" : ""}><ShotTrackerPanel
                roundId={round?.id ?? null}
                roundPlayerId={myPlayer?.id ?? null}
                userId={user?.id ?? null}
                holeNumber={activeHole}
                par={par}
                strokes={myStrokes}
                distanceFt={currentHole?.distance_ft ?? null}
                gpsDriveFt={holeStats?.drive_ft ?? null}
                gpsLongestFt={holeStats?.longest_throw_ft ?? null}
                gpsThrowInFt={holeStats?.throw_in_ft ?? null}
                gpsC1Putts={holeStats?.c1_putts ?? null}
                gpsC2Putts={holeStats?.c2_putts ?? null}
                gpsObStrokes={holeStats?.ob_strokes ?? null}
                gpsParked={holeStats?.parked ?? null}
                gpsThrows={holeStats?.throws ?? null}
              /></div>

              <RoundShotStatsPanel
                roundId={round?.id ?? null}
                roundPlayerId={myPlayer?.id ?? null}
                userId={user?.id ?? null}
              />
            </TabsContent>

            <TabsContent value="hole" className="mt-2 flex-1 space-y-2 overflow-auto">
              {round ? (
                <HoleNotesPanel
                  courseId={round.course_id}
                  layoutId={round.layout_id ?? null}
                  holeNumber={activeHole}
                />
              ) : null}
              {round ? (
                <div><HoleHistoryPanel
                  userId={user?.id ?? null}
                  courseId={round.course_id}
                  layoutId={round.layout_id ?? null}
                  holeNumber={activeHole}
                  par={par}
                /></div>
              ) : null}
              {round ? (
                <div><HoleFieldPanel
                  courseId={round.course_id}
                  layoutId={round.layout_id ?? null}
                  holeNumber={activeHole}
                  par={par}
                /></div>
              ) : null}
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Full-round scorecard */}
      <Sheet open={showScorecard} onOpenChange={setShowScorecard}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-hidden">
          <SheetHeader>
            <SheetTitle>Scorecard</SheetTitle>
            <SheetDescription>
              Every hole for the whole card. Jump to a hole or fix a score without leaving your
              spot.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3 max-h-[65dvh] overflow-auto">
            <RoundScorecardGrid
              players={players.map((p) => ({
                id: p.id,
                display: p.display ?? "Player",
                isMe: !!(user && p.user_id === user.id),
                editable: canEditPlayer(p),
              }))}
              holes={holes.map((h) => ({ number: h.number, par: h.par ?? 3 }))}
              scores={scorecardMap}
              conflicts={conflictKeys}
              activeHole={activeHole}
              onJumpHole={(hole) => {
                setActiveHole(hole);
                setShowScorecard(false);
              }}
              onSaveScore={saveOneScore}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Manage players */}
      <AlertDialog open={!!scoreCheck} onOpenChange={(o) => !o && setScoreCheck(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Check score</AlertDialogTitle>
            <AlertDialogDescription>
              Your recorded throws add up to {scoreCheck?.tracked}, but the score says {scoreCheck?.entered}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Button className="min-h-11" onClick={() => {
              if (scoreCheck) {
                dirtyScores.current.add(scoreCheck.key);
                setPending((p) => ({ ...p, [scoreCheck.key]: scoreCheck.tracked }));
              }
              setScoreCheck(null);
            }}>Use {scoreCheck?.tracked}</Button>
            <Button variant="outline" className="min-h-11" onClick={() => {
              if (scoreCheck) setTrackedScore((p) => { const n = { ...p }; delete n[scoreCheck.key]; return n; });
              setScoreCheck(null);
            }}>Keep {scoreCheck?.entered}</Button>
            <Button variant="ghost" className="min-h-11" onClick={() => { setScoreCheck(null); setThrowOpen(true); }}>Review throws</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showManage} onOpenChange={setShowManage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Round settings</AlertDialogTitle>
            <AlertDialogDescription>
              Add guests, remove players or switch to outdoor mode.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <button
            type="button"
            onClick={toggleOutdoorMode}
            className="flex min-h-11 w-full items-center justify-between rounded-md border border-border px-3 text-sm"
          >
            <span className="flex items-center gap-2">
              {outdoorMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Outdoor mode (bright sun)
            </span>
            <span className="font-semibold">{outdoorMode ? "On" : "Off"}</span>
          </button>
          <button
            type="button"
            onClick={() => walk.setEnabled(!walk.enabled)}
            className="flex min-h-11 w-full items-center justify-between rounded-md border border-border px-3 text-left text-sm"
          >
            <span>
              Track my walk (path, steps, calories, climb)
              <span className="block text-muted-foreground">
                Uses GPS all round. Steps and calories are estimates; keep the screen on for a complete path.
              </span>
            </span>
            <span className="font-semibold">{walk.enabled ? "On" : "Off"}</span>
          </button>
          {walk.error ? <p className="text-sm text-destructive">{walk.error}</p> : null}
          <ul className="space-y-1">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
              >
                <span>{p.display}</span>
                {isCreator && players.length > 1 ? (
                  <button
                    onClick={() => removePlayer(p.id)}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {isCreator ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Add guest…"
              />
              <Button variant="outline" onClick={addGuest}>
                <UserPlus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowManage(false)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={confirmFinish}
        onOpenChange={(o) => {
          // Guard against auto-closing while the async finish() is running —
          // that unmount was the source of the "freeze" (state torn out mid-await).
          if (finishing) return;
          setConfirmFinish(o);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" /> End Round & Submit Scores
            </DialogTitle>
            <DialogDescription>
              Review every player's card. Scores can't be edited after submit.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const isRated = round?.is_rated !== false && round?.rating_mode !== "casual";
            const cardSize = players.length;
            const layoutHoleCount = holes.length;
            const parTotal = holes.reduce((s, h) => s + h.par, 0);
            const rows = players.map((p) => {
              const ps = scores.filter((s) => s.round_player_id === p.id);
              const total = ps.reduce((s, x) => s + x.strokes, 0);
              const holesPlayed = ps.length;
              const proratedPar =
                layoutHoleCount > 0
                  ? Math.round((parTotal * holesPlayed) / layoutHoleCount)
                  : parTotal;
              const toPar = total - proratedPar;
              const complete = holesPlayed === layoutHoleCount && layoutHoleCount > 0;
              const confirmedHoles = ps.filter((s) =>
                confirmations.some(
                  (c) =>
                    c.round_player_id === p.id &&
                    c.hole_number === s.hole_number &&
                    c.confirmed_by !== (p.user_id ?? "") &&
                    c.strokes === s.strokes,
                ),
              ).length;
              return { p, total, holesPlayed, toPar, complete, confirmedHoles };
            });
            const scoringCount = rows.filter((r) => r.complete).length;
            const meetsThreshold = meetsSanctionedThreshold(cardSize, scoringCount);
            const willBeRated =
              isRated &&
              meetsThreshold &&
              rows.some((r) => r.complete && r.confirmedHoles === r.holesPlayed);

            return (
              <>
                <div
                  className={
                    "flex items-start gap-2 rounded-md border p-3 text-xs " +
                    (willBeRated
                      ? "border-primary/40 bg-primary/5"
                      : "border-amber-500/40 bg-amber-500/10")
                  }
                >
                  {willBeRated ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">
                      {willBeRated ? "Card will submit as DGD Rated" : "Card will submit as Casual"}
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {!isRated
                        ? "This round was started in casual mode — scores are saved but no DGD rating is recorded."
                        : !meetsThreshold
                          ? `DGD Rated needs ${requiredScorerCount(cardSize)} of ${cardSize} scoring players. Right now: ${scoringCount}.`
                          : willBeRated
                            ? "All qualifying scores are cardmate-confirmed. Ratings will post to the Statboard on submit."
                            : "Some holes still need a cardmate confirmation to count toward DGD rating."}
                    </p>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Player</th>
                        <th className="px-3 py-2 text-right">Thru</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">To par</th>
                        <th className="px-3 py-2 text-right">Confirmed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.p.id} className="border-t border-border">
                          <td className="px-3 py-2 truncate">
                            {r.p.display ?? r.p.guest_name ?? "Player"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {r.holesPlayed}/{layoutHoleCount}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
                            {r.total || "—"}
                          </td>
                          <td
                            className={
                              "px-3 py-2 text-right tabular-nums " +
                              (r.toPar < 0 ? "text-primary" : r.toPar > 0 ? "text-destructive" : "")
                            }
                          >
                            {r.holesPlayed === 0
                              ? "—"
                              : r.toPar === 0
                                ? "E"
                                : r.toPar > 0
                                  ? `+${r.toPar}`
                                  : r.toPar}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                            {r.confirmedHoles}/{r.holesPlayed}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFinish(false)} disabled={finishing}>
              Keep playing
            </Button>
            <Button onClick={finish} disabled={finishing}>
              {finishing ? "Submitting…" : "End Round & Submit Scores"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Leave this rated round?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This round is committed — two or more players have already scored a hole. Bailing now
              applies an abandonment penalty to every rated player on the card. Finish the round to
              keep your DGD rating clean.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmExit(false);
                navigate({ to: "/play" });
              }}
            >
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RoundShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        userId={user?.id ?? null}
        summary={shareSummary}
        text={shareText}
        onTextChange={setShareText}
        visibility={shareVisibility}
        onVisibilityChange={setShareVisibility}
        selectedIds={shareTagIds}
        onToggleId={(id) =>
          setShareTagIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
          )
        }
        suggestedIds={cardmateUserIds}
        sharing={sharing}
        onShare={shareRound}
        onSkip={() => {
          setShareOpen(false);
          navigate({ to: "/play/$roundId/review", params: { roundId } });
        }}
      />
    </div>
  );
}
