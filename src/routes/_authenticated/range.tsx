import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Target,
  Play,
  StopCircle,
  MapPin,
  Crosshair,
  Trash2,
  Trophy,
  Shield,
  Wind,
  CheckCircle2,
  Sparkles,
  Flag,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import {
  buildChallenges,
  evaluateThrow,
  type Challenge,
  type DiscInfo,
} from "@/lib/range-coaching";
import {
  SessionDiscPicker,
  type SessionDisc,
  type BagDiscOption,
} from "@/components/session-disc-picker";
import { RangeFieldView } from "@/components/range-field-view";
import { fetchBagDiscs, type BagDisc as SharedBagDisc } from "@/lib/entities/bag";
import { degToCompass, rangeWindTip } from "@/lib/wind-helpers";
import { useServerFn } from "@tanstack/react-start";
import { fetchWeatherForPoint } from "@/lib/data-connectors.functions";
import { PageShell } from "@/components/shell/page-shell";

const sb: any = supabase;

export const Route = createFileRoute("/_authenticated/range")({
  component: RangePage,
  head: () => ({
    meta: [
      { title: "Driving range · Practice · DG Dashboard" },
      {
        name: "description",
        content:
          "Drop GPS cones at 100, 200, 300 and 400 feet, then let your coach challenge you to hit new lines with every disc in your bag.",
      },
      { property: "og:title", content: "Driving range · Practice · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Turn any open field into a coached driving range with distance cones and shot-shape challenges.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type ConeMarker = { distance_ft: number; latitude: number; longitude: number; set_at: string };

type Session = {
  id: string;
  user_id: string;
  name: string | null;
  location: string | null;
  tee_latitude: number | null;
  tee_longitude: number | null;
  wind_mph: number | null;
  wind_dir: string | null;
  conditions: string | null;
  wind_gust_mph: number | null;
  wind_deg: number | null;
  temperature_f: number | null;
  weather_synced_at: string | null;
  started_at: string;
  ended_at: string | null;
  cone_markers: ConeMarker[] | null;
  coaching_challenges: string[] | null;
  session_discs: SessionDisc[] | null;
};

type Throw = {
  id: string;
  session_id: string;
  throw_index: number;
  disc_id: string | null;
  mold_id: string | null;
  disc_label: string | null;
  shape: ShotShape | null;
  intent: ShotIntent;
  landed_latitude: number;
  landed_longitude: number;
  gps_accuracy_m: number | null;
  distance_ft: number;
  lateral_ft: number | null;
  notes: string | null;
  created_at: string;
};

type ShotShape =
  | "hyzer"
  | "anhyzer"
  | "flat"
  | "flex"
  | "s_curve"
  | "hyzer_flip"
  | "turnover"
  | "spike_hyzer"
  | "skip"
  | "roller"
  | "tomahawk"
  | "thumber"
  | "scoober";
type ShotIntent = "max_distance" | "control" | "placement" | "safety_off_tee" | "approach" | "putt";

const SHAPES: { value: ShotShape; label: string }[] = [
  { value: "hyzer", label: "Hyzer" },
  { value: "anhyzer", label: "Anhyzer" },
  { value: "flat", label: "Flat" },
  { value: "flex", label: "Flex" },
  { value: "s_curve", label: "S-Curve" },
  { value: "hyzer_flip", label: "Hyzer Flip" },
  { value: "turnover", label: "Turnover" },
  { value: "spike_hyzer", label: "Spike Hyzer" },
  { value: "skip", label: "Skip" },
  { value: "roller", label: "Roller" },
  { value: "tomahawk", label: "Tomahawk" },
  { value: "thumber", label: "Thumber" },
  { value: "scoober", label: "Scoober" },
];

const INTENTS: { value: ShotIntent; label: string; icon: typeof Trophy }[] = [
  { value: "max_distance", label: "Max Distance", icon: Trophy },
  { value: "safety_off_tee", label: "Safety Off Tee", icon: Shield },
  { value: "control", label: "Control", icon: Target },
  { value: "placement", label: "Placement", icon: Crosshair },
  { value: "approach", label: "Approach", icon: Target },
  { value: "putt", label: "Putt", icon: Target },
];

const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const CONE_TARGETS = [100, 200, 300, 400];

// Bag rows come from the shared bag entity so every tool agrees on what is
// still in the player's bag.
type BagDisc = SharedBagDisc;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const mToFt = (m: number) => Math.round(m * 3.28084);

function useGeolocation() {
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const idRef = useRef<number | null>(null);

  const start = () => {
    if (!("geolocation" in navigator)) {
      setErr("Geolocation isn't available on this device.");
      return;
    }
    if (idRef.current != null) return;
    setWatching(true);
    idRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setPos(p);
        setErr(null);
      },
      (e) => {
        setErr(e.message);
        setWatching(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };
  const stop = () => {
    if (idRef.current != null) navigator.geolocation.clearWatch(idRef.current);
    idRef.current = null;
    setWatching(false);
  };
  useEffect(() => () => stop(), []);
  return { pos, err, watching, start, stop };
}

function RangePage() {
  const { user } = useSession();
  const geo = useGeolocation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [throws, setThrows] = useState<Throw[]>([]);
  const [bag, setBag] = useState<BagDisc[]>([]);
  const [markOpen, setMarkOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [pickedDiscs, setPickedDiscs] = useState<SessionDisc[]>([]);
  const fetchWeather = useServerFn(fetchWeatherForPoint);

  // draft mark
  const [draftDisc, setDraftDisc] = useState<string>("");
  const [draftShape, setDraftShape] = useState<ShotShape>("flat");
  const [draftIntent, setDraftIntent] = useState<ShotIntent>("max_distance");
  const [draftChallengeId, setDraftChallengeId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftLat, setDraftLat] = useState<number | null>(null);
  const [draftLon, setDraftLon] = useState<number | null>(null);
  const [draftAcc, setDraftAcc] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ss }, { data: bd }] = await Promise.all([
        sb
          .from("range_sessions")
          .select("*")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false }),
        fetchBagDiscs(user.id).then((rows) => ({ data: rows })),
      ]);
      setSessions((ss ?? []) as Session[]);
      setBag((bd ?? []) as BagDisc[]);
      const openSession = (ss ?? []).find((s: Session) => !s.ended_at) ?? null;
      if (openSession) setActive(openSession);
    })();
  }, [user]);

  useEffect(() => {
    if (!active) {
      setThrows([]);
      return;
    }
    (async () => {
      const { data } = await sb
        .from("range_throws")
        .select("*")
        .eq("session_id", active.id)
        .order("throw_index");
      setThrows((data ?? []) as Throw[]);
    })();
  }, [active?.id]);

  useEffect(() => {
    if (active) geo.start();
  }, [active?.id]);

  const cones: ConeMarker[] = active?.cone_markers ?? [];
  const completedChallenges: string[] = active?.coaching_challenges ?? [];
  const coneDistances = cones.map((c) => c.distance_ft);
  const nextTargetCone = CONE_TARGETS.find((t) => !coneDistances.includes(t)) ?? null;
  const setupComplete = nextTargetCone == null;

  const syncWeatherFor = async (sessionId: string, lat: number, lon: number) => {
    try {
      const w = await fetchWeather({ data: { latitude: lat, longitude: lon } });
      const cur = (w as { current?: Record<string, number> })?.current ?? {};
      const mph = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null;
      const gust = cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : null;
      const deg = cur.wind_direction_10m != null ? Math.round(cur.wind_direction_10m) : null;
      const tempF = cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null;
      const dir = degToCompass(deg);
      const patch = {
        wind_mph: mph,
        wind_dir: dir,
        wind_gust_mph: gust,
        wind_deg: deg,
        temperature_f: tempF,
        weather_synced_at: new Date().toISOString(),
      };
      await sb.from("range_sessions").update(patch).eq("id", sessionId);
      setActive((a) => (a && a.id === sessionId ? { ...a, ...patch } : a));
      setSessions((s) => s.map((x) => (x.id === sessionId ? { ...x, ...patch } : x)));
      toast.success(
        `Weather synced — ${mph ?? "?"} mph${dir ? " " + dir : ""}${tempF != null ? " · " + tempF + "°F" : ""}`,
      );
    } catch (e) {
      toast.error("Couldn't fetch weather", { description: (e as Error).message });
    }
  };

  const refreshWeather = async () => {
    if (!active?.tee_latitude || !active?.tee_longitude) return;
    await syncWeatherFor(active.id, active.tee_latitude, active.tee_longitude);
  };

  const startSession = async () => {
    if (!user) return;
    if (!geo.pos) {
      toast.error("Waiting on GPS - tap allow to share location.");
      geo.start();
      return;
    }
    const { latitude, longitude } = geo.pos.coords;
    const { data, error } = await sb
      .from("range_sessions")
      .insert({
        user_id: user.id,
        name: newName.trim() || null,
        tee_latitude: latitude,
        tee_longitude: longitude,
        cone_markers: [],
        coaching_challenges: [],
        session_discs: pickedDiscs,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setSessions((s) => [data as Session, ...s]);
    setActive(data as Session);
    setNewName("");
    toast.success("Tee locked in. Now walk out and set your 100 ft cone.");
    void syncWeatherFor((data as Session).id, latitude, longitude);
  };

  const endSession = async () => {
    if (!active) return;
    const { error } = await sb
      .from("range_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", active.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSessions((s) =>
      s.map((x) => (x.id === active.id ? { ...x, ended_at: new Date().toISOString() } : x)),
    );
    setActive(null);
    geo.stop();
    toast.success("Session saved.");
  };

  const setCone = async (distance_ft: number) => {
    if (!active || !geo.pos || active.tee_latitude == null || active.tee_longitude == null) {
      toast.error("Need a GPS fix to drop a cone.");
      return;
    }
    const { latitude, longitude } = geo.pos.coords;
    const measured = mToFt(
      haversineMeters(active.tee_latitude, active.tee_longitude, latitude, longitude),
    );
    if (Math.abs(measured - distance_ft) > 40 && distance_ft <= 400) {
      const proceed = window.confirm(
        `You're ${measured} ft from the tee — the ${distance_ft} ft cone should be within ~40 ft. Drop the cone here anyway?`,
      );
      if (!proceed) return;
    }
    const cone: ConeMarker = { distance_ft, latitude, longitude, set_at: new Date().toISOString() };
    const nextCones = [...cones.filter((c) => c.distance_ft !== distance_ft), cone].sort(
      (a, b) => a.distance_ft - b.distance_ft,
    );
    const { error } = await sb
      .from("range_sessions")
      .update({ cone_markers: nextCones })
      .eq("id", active.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setActive({ ...active, cone_markers: nextCones });
    toast.success(`${distance_ft} ft cone locked (${measured} ft measured).`);
  };

  const removeCone = async (distance_ft: number) => {
    if (!active) return;
    const nextCones = cones.filter((c) => c.distance_ft !== distance_ft);
    const { error } = await sb
      .from("range_sessions")
      .update({ cone_markers: nextCones })
      .eq("id", active.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setActive({ ...active, cone_markers: nextCones });
  };

  const saveWind = async (mph: number | null, dir: string | null) => {
    if (!active) return;
    const { error } = await sb
      .from("range_sessions")
      .update({ wind_mph: mph, wind_dir: dir })
      .eq("id", active.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setActive({ ...active, wind_mph: mph, wind_dir: dir });
  };

  const openMark = (challengeId?: string | null) => {
    if (!active) return;
    if (!geo.pos) {
      toast.error("No GPS fix yet.");
      return;
    }
    setDraftLat(geo.pos.coords.latitude);
    setDraftLon(geo.pos.coords.longitude);
    setDraftAcc(geo.pos.coords.accuracy ?? null);
    setDraftDisc(bag[0]?.id ?? "");
    setDraftShape("flat");
    setDraftIntent("max_distance");
    setDraftChallengeId(challengeId ?? null);
    setDraftNotes("");
    setMarkOpen(true);
  };

  const discInfoFromBag = (id: string): DiscInfo | null => {
    const b = bag.find((x) => x.id === id);
    if (!b) return null;
    return {
      id: b.id,
      label: b.nickname || b.mold?.name || "Disc",
      speed: b.mold?.speed ?? null,
      glide: b.mold?.glide ?? null,
      turn: b.mold?.turn ?? null,
      fade: b.mold?.fade ?? null,
    };
  };

  const saveMark = async () => {
    if (
      !active ||
      !user ||
      draftLat == null ||
      draftLon == null ||
      active.tee_latitude == null ||
      active.tee_longitude == null
    )
      return;
    const meters = haversineMeters(active.tee_latitude, active.tee_longitude, draftLat, draftLon);
    const distFt = mToFt(meters);
    const chosen = bag.find((b) => b.id === draftDisc);
    const label = chosen ? chosen.nickname || chosen.mold?.name || "Disc" : "Unknown";
    const { data, error } = await sb
      .from("range_throws")
      .insert({
        session_id: active.id,
        user_id: user.id,
        throw_index: throws.length,
        disc_id: chosen?.id ?? null,
        mold_id: chosen?.mold?.id ?? null,
        disc_label: label,
        shape: draftShape,
        intent: draftIntent,
        landed_latitude: draftLat,
        landed_longitude: draftLon,
        gps_accuracy_m: draftAcc,
        distance_ft: distFt,
        notes: draftNotes || null,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setThrows((t) => [...t, data as Throw]);
    setMarkOpen(false);
    toast.success(`Logged ${distFt} ft`);

    // Evaluate challenge if attached
    if (draftChallengeId) {
      const ch = challenges.find((c) => c.id === draftChallengeId);
      if (ch) {
        const result = evaluateThrow(ch, {
          distance_ft: distFt,
          shape: draftShape,
          disc_speed: chosen?.mold?.speed ?? null,
          disc_label: label,
        });
        if (result.met) {
          const nextCompleted = Array.from(new Set([...completedChallenges, ch.id]));
          await sb
            .from("range_sessions")
            .update({ coaching_challenges: nextCompleted })
            .eq("id", active.id);
          setActive({ ...active, coaching_challenges: nextCompleted });
          toast.success(`Challenge cleared: ${ch.title}`, { description: result.message });
        } else {
          toast.info(result.message, { description: "Try again — the coach believes in you." });
        }
      }
    }
  };

  const deleteThrow = async (id: string) => {
    const { error } = await sb.from("range_throws").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setThrows((t) => t.filter((x) => x.id !== id));
  };

  const teeDistNow = useMemo(() => {
    if (!active?.tee_latitude || !active?.tee_longitude || !geo.pos) return null;
    return mToFt(
      haversineMeters(
        active.tee_latitude,
        active.tee_longitude,
        geo.pos.coords.latitude,
        geo.pos.coords.longitude,
      ),
    );
  }, [active, geo.pos]);

  const bagDiscs: DiscInfo[] = useMemo(
    () =>
      bag.map((b) => ({
        id: b.id,
        label: b.nickname || b.mold?.name || "Disc",
        speed: b.mold?.speed ?? null,
        glide: b.mold?.glide ?? null,
        turn: b.mold?.turn ?? null,
        fade: b.mold?.fade ?? null,
      })),
    [bag],
  );

  const challenges: Challenge[] = useMemo(
    () =>
      buildChallenges({
        discs: bagDiscs,
        wind: { mph: active?.wind_mph ?? null, from: active?.wind_dir ?? null },
        cones: coneDistances,
        completed: completedChallenges,
      }),
    [
      bagDiscs,
      active?.wind_mph,
      active?.wind_dir,
      coneDistances.join(","),
      completedChallenges.join(","),
    ],
  );

  const stats = useMemo(() => buildStats(throws), [throws]);

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" /> Digital Driving Range
          </h1>
          <p className="text-sm text-muted-foreground">
            Set your tee, drop GPS cones at 100/200/300/400 ft, then let the coach push your game.
          </p>
        </div>
        {active ? (
          <Button variant="destructive" onClick={endSession}>
            <StopCircle className="h-4 w-4 mr-2" />
            End session
          </Button>
        ) : null}
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a new session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-2">
              <Input
                placeholder="Session name (optional) - e.g. Back field, west wind"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Button onClick={startSession}>
                <Play className="h-4 w-4 mr-2" />
                Set tee & start
              </Button>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              {geo.err ? (
                <span className="text-destructive">{geo.err}</span>
              ) : geo.pos ? (
                <span>
                  GPS locked (±{Math.round(geo.pos.coords.accuracy)} m). Stand on your intended tee.
                  Weather will auto-sync.
                </span>
              ) : (
                <button className="underline" onClick={geo.start}>
                  Enable GPS
                </button>
              )}
            </div>
            <SessionDiscPicker
              bag={bag as unknown as BagDiscOption[]}
              value={pickedDiscs}
              onChange={setPickedDiscs}
              mode="range"
              title="Discs for this session (optional — add quantities)"
            />
          </CardContent>
        </Card>
      )}

      {active && (
        <>
          <ConeSetup
            cones={cones}
            nextTarget={nextTargetCone}
            teeDistNow={teeDistNow}
            gpsReady={!!geo.pos}
            accuracy={geo.pos?.coords.accuracy ?? null}
            onSetCone={setCone}
            onRemoveCone={removeCone}
          />

          <WindConditions
            windMph={active.wind_mph}
            windDir={active.wind_dir}
            gustMph={active.wind_gust_mph}
            tempF={active.temperature_f}
            syncedAt={active.weather_synced_at}
            onSave={saveWind}
            onRefresh={refreshWeather}
          />

          {(() => {
            const tip = rangeWindTip(
              active.wind_mph,
              active.wind_gust_mph,
              degToCompass(active.wind_deg),
            );
            if (!tip) return null;
            const tone =
              tip.severity === "gusty"
                ? "border-amber-500/50 bg-amber-500/10"
                : tip.severity === "strong"
                  ? "border-orange-500/50 bg-orange-500/10"
                  : tip.severity === "breeze"
                    ? "border-cyan-500/50 bg-cyan-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10";
            return (
              <div className={`rounded-md border p-3 ${tone}`}>
                <div className="text-xs uppercase tracking-wide font-semibold flex items-center gap-1">
                  <Wind className="h-3 w-3" /> Wind coach
                </div>
                <div className="font-semibold">{tip.title}</div>
                <div className="text-sm text-muted-foreground">{tip.detail}</div>
              </div>
            );
          })()}

          <RangeFieldView
            teeLat={active.tee_latitude}
            teeLon={active.tee_longitude}
            cones={cones}
            throws={throws.map((t) => ({
              id: t.id,
              distance_ft: t.distance_ft,
              landed_latitude: t.landed_latitude,
              landed_longitude: t.landed_longitude,
              disc_label: t.disc_label,
              disc_color: bag.find((b) => b.id === t.disc_id)?.color ?? null,
              shape: t.shape,
            }))}
            windDeg={active.wind_deg}
            windMph={active.wind_mph}
            windFrom={degToCompass(active.wind_deg)}
            gustMph={active.wind_gust_mph}
          />

          {setupComplete && (
            <CoachPanel
              challenges={challenges}
              completed={completedChallenges}
              onMarkForChallenge={openMark}
            />
          )}

          <Card>
            <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat
                label="Tee distance"
                value={teeDistNow != null ? `${teeDistNow} ft` : "—"}
                sub={geo.pos ? `±${Math.round(geo.pos.coords.accuracy)} m` : "Waiting on GPS"}
              />
              <Stat label="Throws logged" value={String(throws.length)} />
              <Stat
                label="Best throw"
                value={stats.best ? `${stats.best.distance_ft} ft` : "—"}
                sub={stats.best?.disc_label ?? undefined}
              />
              <Stat label="Avg distance" value={stats.avg ? `${stats.avg} ft` : "—"} />
              <div className="col-span-2 md:col-span-4 pt-2">
                <Button
                  size="lg"
                  className="w-full h-14 text-base"
                  onClick={() => openMark(null)}
                  disabled={!geo.pos}
                >
                  <Crosshair className="h-5 w-5 mr-2" /> Mark throw at my location
                </Button>
                <div className="text-xs text-muted-foreground mt-2 text-center">
                  Walk to where the disc landed, then tap. Distance is measured from the tee.
                </div>
              </div>
            </CardContent>
          </Card>

          <ThrowList throws={throws} cones={cones} onDelete={deleteThrow} />
          <StatsPanels stats={stats} />
        </>
      )}

      {!active && sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions
              .filter((s) => s.ended_at)
              .slice(0, 10)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s)}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{s.name || "Range session"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.started_at).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="secondary">Review</Badge>
                  </div>
                </button>
              ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {draftChallengeId ? "Log throw for challenge" : "Log this throw"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {draftChallengeId &&
              (() => {
                const ch = challenges.find((c) => c.id === draftChallengeId);
                if (!ch) return null;
                return (
                  <div className="p-3 rounded-md border border-primary/40 bg-primary/5">
                    <div className="text-xs uppercase tracking-wide text-primary font-semibold flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Challenge
                    </div>
                    <div className="font-semibold">{ch.title}</div>
                    <div className="text-xs text-muted-foreground">{ch.detail}</div>
                  </div>
                );
              })()}
            <div className="p-3 rounded-md bg-muted text-center">
              <div className="text-3xl font-bold">
                {active?.tee_latitude &&
                draftLat != null &&
                draftLon != null &&
                active.tee_longitude != null
                  ? `${mToFt(haversineMeters(active.tee_latitude, active.tee_longitude, draftLat, draftLon))} ft`
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                ±{draftAcc ? Math.round(draftAcc) : "?"} m GPS accuracy
              </div>
            </div>
            <div>
              <Label>Disc</Label>
              <Select value={draftDisc} onValueChange={setDraftDisc}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick from your bag" />
                </SelectTrigger>
                <SelectContent>
                  {bag.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground">
                      No discs in bag. Add discs in My Bag to break down stats by disc.
                    </div>
                  )}
                  {bag.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nickname || d.mold?.name || "Disc"}
                      {d.mold?.manufacturer?.name ? ` · ${d.mold.manufacturer.name}` : ""}
                      {d.mold?.speed != null ? ` · S${d.mold.speed}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draftDisc &&
                (() => {
                  const info = discInfoFromBag(draftDisc);
                  if (!info || info.speed == null) return null;
                  return (
                    <div className="text-xs text-muted-foreground mt-1">
                      Speed {info.speed} · Glide {info.glide ?? "?"} · Turn {info.turn ?? "?"} ·
                      Fade {info.fade ?? "?"}
                    </div>
                  );
                })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Shot shape</Label>
                <Select value={draftShape} onValueChange={(v) => setDraftShape(v as ShotShape)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHAPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Intent</Label>
                <Select value={draftIntent} onValueChange={(v) => setDraftIntent(v as ShotIntent)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTENTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Grip, release, wind, etc."
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveMark}>Save throw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function ConeSetup({
  cones,
  nextTarget,
  teeDistNow,
  gpsReady,
  accuracy,
  onSetCone,
  onRemoveCone,
}: {
  cones: ConeMarker[];
  nextTarget: number | null;
  teeDistNow: number | null;
  gpsReady: boolean;
  accuracy: number | null;
  onSetCone: (ft: number) => void;
  onRemoveCone: (ft: number) => void;
}) {
  const status = (ft: number) => cones.find((c) => c.distance_ft === ft);
  const guidance =
    nextTarget != null && teeDistNow != null
      ? teeDistNow < nextTarget - 20
        ? `Keep walking — ${nextTarget - teeDistNow} ft to go`
        : teeDistNow > nextTarget + 20
          ? `Back up ${teeDistNow - nextTarget} ft`
          : `You're close! Drop the ${nextTarget} ft cone now`
      : nextTarget != null
        ? "Waiting on GPS…"
        : "All cones set — you're ready to practice.";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flag className="h-4 w-4" /> Distance cones
          {nextTarget == null && <Badge className="ml-2">Setup complete</Badge>}
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          Walk out from the tee and tap the cone button when you get to each distance. Your GPS
          handles the exact measurement.
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {nextTarget != null && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-primary font-semibold">
                Next cone: {nextTarget} ft
              </div>
              <div className="text-sm font-medium">{guidance}</div>
              <div className="text-xs text-muted-foreground">
                You're at {teeDistNow ?? "—"} ft from the tee{" "}
                {accuracy != null ? `(±${Math.round(accuracy)} m GPS)` : ""}
              </div>
            </div>
            <Button onClick={() => onSetCone(nextTarget)} disabled={!gpsReady}>
              <MapPin className="h-4 w-4 mr-1" /> Drop cone here
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {CONE_TARGETS.map((ft) => {
            const set = status(ft);
            return (
              <div
                key={ft}
                className={`rounded-md border p-3 text-center ${set ? "border-primary/60 bg-primary/5" : "border-dashed"}`}
              >
                <div className="text-lg font-bold">{ft} ft</div>
                {set ? (
                  <>
                    <div className="text-xs text-emerald-600 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Placed
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 text-xs"
                      onClick={() => onRemoveCone(ft)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Re-drop
                    </Button>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">Not set</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function WindConditions({
  windMph,
  windDir,
  gustMph,
  tempF,
  syncedAt,
  onSave,
  onRefresh,
}: {
  windMph: number | null;
  windDir: string | null;
  gustMph?: number | null;
  tempF?: number | null;
  syncedAt?: string | null;
  onSave: (mph: number | null, dir: string | null) => void;
  onRefresh?: () => void;
}) {
  const [mph, setMph] = useState<string>(windMph != null ? String(windMph) : "");
  const [dir, setDir] = useState<string>(windDir ?? "");
  useEffect(() => {
    setMph(windMph != null ? String(windMph) : "");
    setDir(windDir ?? "");
  }, [windMph, windDir]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Wind className="h-4 w-4" /> Wind conditions
          </CardTitle>
          {onRefresh && (
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh from weather
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Auto-synced from your tee GPS. Override manually if you feel a different pocket.
          {tempF != null ? ` · ${tempF}°F` : ""}
          {gustMph != null ? ` · Gusts ${gustMph} mph` : ""}
          {syncedAt ? ` · Synced ${new Date(syncedAt).toLocaleTimeString()}` : ""}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2 items-end">
        <div>
          <Label className="text-xs">Wind speed (mph)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={mph}
            onChange={(e) => setMph(e.target.value)}
            placeholder="e.g. 12"
          />
        </div>
        <div>
          <Label className="text-xs">Wind is coming FROM</Label>
          <Select value={dir || "none"} onValueChange={(v) => setDir(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Calm / unknown</SelectItem>
              {WIND_DIRS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="secondary" onClick={() => onSave(mph ? Number(mph) : null, dir || null)}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function CoachPanel({
  challenges,
  completed,
  onMarkForChallenge,
}: {
  challenges: Challenge[];
  completed: string[];
  onMarkForChallenge: (id: string) => void;
}) {
  const active = challenges.filter((c) => !completed.includes(c.id));
  const done = challenges.filter((c) => completed.includes(c.id));

  const tierColor: Record<Challenge["tier"], string> = {
    warmup: "bg-muted text-foreground",
    skill: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    stretch: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    wind: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Coach's challenges
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          Personalized to the discs in your bag, your cone distances, and the wind you set. Try them
          in order — or pick your favorite.
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {active.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No challenges — add discs to your bag or set wind conditions to unlock more.
          </div>
        )}
        {active.map((c) => (
          <div key={c.id} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={tierColor[c.tier]}>{c.tier}</Badge>
                  {c.target_ft != null && <Badge variant="outline">{c.target_ft} ft</Badge>}
                  {c.disc_hint && <Badge variant="secondary">{c.disc_hint}</Badge>}
                </div>
                <div className="font-semibold mt-1">{c.title}</div>
                <div className="text-sm text-muted-foreground">{c.detail}</div>
                <div className="text-xs mt-1 italic text-foreground/80">"{c.coaching}"</div>
              </div>
              <Button size="sm" onClick={() => onMarkForChallenge(c.id)}>
                <Crosshair className="h-3.5 w-3.5 mr-1" />
                Throw it
              </Button>
            </div>
          </div>
        ))}
        {done.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Cleared this session
            </div>
            <div className="flex flex-wrap gap-1">
              {done.map((c) => (
                <Badge key={c.id} variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  {c.title}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function nearestConeLabel(distance_ft: number, cones: ConeMarker[]): string | null {
  if (cones.length === 0) return null;
  const sorted = [...cones].sort((a, b) => a.distance_ft - b.distance_ft);
  const past = [...sorted].reverse().find((c) => c.distance_ft <= distance_ft);
  const next = sorted.find((c) => c.distance_ft > distance_ft);
  if (past && next) return `${distance_ft - past.distance_ft} ft past ${past.distance_ft} cone`;
  if (past) return `${distance_ft - past.distance_ft} ft past ${past.distance_ft} cone`;
  if (next) return `${next.distance_ft - distance_ft} ft short of ${next.distance_ft} cone`;
  return null;
}

function ThrowList({
  throws,
  cones,
  onDelete,
}: {
  throws: Throw[];
  cones: ConeMarker[];
  onDelete: (id: string) => void;
}) {
  if (throws.length === 0) return null;
  const sorted = [...throws].sort((a, b) => b.throw_index - a.throw_index);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Throws this session</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-2 rounded border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 text-right font-bold text-lg">
                {t.distance_ft}
                <span className="text-xs font-normal ml-0.5">ft</span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{t.disc_label || "Disc"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {shapeLabel(t.shape)} · {intentLabel(t.intent)}
                  {(() => {
                    const n = nearestConeLabel(t.distance_ft, cones);
                    return n ? ` · ${n}` : "";
                  })()}
                </div>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => onDelete(t.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type Stats = ReturnType<typeof buildStats>;

function buildStats(throws: Throw[]) {
  if (throws.length === 0)
    return {
      best: null as Throw | null,
      avg: 0,
      byDisc: [] as { key: string; count: number; best: number; avg: number }[],
      byShape: [] as { key: string; count: number; best: number; avg: number }[],
      safety: [] as { key: string; count: number; avg: number; consistency: number }[],
    };
  const best = throws.reduce((a, b) => (b.distance_ft > a.distance_ft ? b : a));
  const avg = Math.round(throws.reduce((a, b) => a + b.distance_ft, 0) / throws.length);

  const group = <T,>(
    arr: Throw[],
    keyFn: (t: Throw) => string | null | undefined,
    extra?: (rows: Throw[]) => T,
  ) => {
    const m = new Map<string, Throw[]>();
    for (const t of arr) {
      const k = keyFn(t);
      if (!k) continue;
      const list = m.get(k) ?? [];
      list.push(t);
      m.set(k, list);
    }
    return [...m.entries()].map(([key, rows]) => ({
      key,
      count: rows.length,
      best: Math.max(...rows.map((r) => r.distance_ft)),
      avg: Math.round(rows.reduce((a, b) => a + b.distance_ft, 0) / rows.length),
      ...(extra ? extra(rows) : {}),
    })) as (T & { key: string; count: number; best: number; avg: number })[];
  };

  const byDisc = group(throws, (t) => t.disc_label).sort((a, b) => b.best - a.best);
  const byShape = group(throws, (t) => shapeLabel(t.shape)).sort((a, b) => b.best - a.best);

  const safetyThrows = throws.filter(
    (t) => t.intent === "safety_off_tee" || t.intent === "control",
  );
  const safety = group(
    safetyThrows,
    (t) => t.disc_label,
    (rows) => {
      const mean = rows.reduce((a, b) => a + b.distance_ft, 0) / rows.length;
      const variance = rows.reduce((a, b) => a + (b.distance_ft - mean) ** 2, 0) / rows.length;
      return { consistency: Math.round(Math.sqrt(variance)) };
    },
  ).sort((a, b) => a.consistency - b.consistency);

  return { best, avg, byDisc, byShape, safety };
}

function StatsPanels({ stats }: { stats: Stats }) {
  if (!stats.best) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Best distance by disc
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.byDisc.slice(0, 8).map((r) => (
            <StatRow
              key={r.key}
              name={r.key}
              left={`Best ${r.best} ft`}
              right={`Avg ${r.avg} ft · ${r.count} throws`}
              pct={r.best}
              maxVal={stats.byDisc[0].best}
            />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" /> Best distance by shot shape
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.byShape.slice(0, 8).map((r) => (
            <StatRow
              key={r.key}
              name={r.key}
              left={`Best ${r.best} ft`}
              right={`Avg ${r.avg} ft · ${r.count} throws`}
              pct={r.best}
              maxVal={stats.byShape[0].best}
            />
          ))}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Safest off the tee
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.safety.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Log throws with intent "Safety Off Tee" or "Control" to build this list. Lower ± is
              more repeatable.
            </div>
          ) : (
            stats.safety.slice(0, 6).map((r) => (
              <div key={r.key} className="flex items-center justify-between p-2 rounded border">
                <div>
                  <div className="font-medium">{r.key}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.count} throws · avg {r.avg} ft
                  </div>
                </div>
                <Badge variant={r.consistency <= 15 ? "default" : "secondary"}>
                  ±{r.consistency} ft
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatRow({
  name,
  left,
  right,
  pct,
  maxVal,
}: {
  name: string;
  left: string;
  right: string;
  pct: number;
  maxVal: number;
}) {
  const w = Math.max(6, Math.round((pct / Math.max(maxVal, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">{right}</span>
      </div>
      <div className="h-2 bg-muted rounded overflow-hidden mt-1">
        <div className="h-full bg-primary" style={{ width: `${w}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{left}</div>
    </div>
  );
}

function shapeLabel(s: ShotShape | null | undefined) {
  return SHAPES.find((x) => x.value === s)?.label ?? "—";
}
function intentLabel(i: ShotIntent) {
  return INTENTS.find((x) => x.value === i)?.label ?? i;
}
