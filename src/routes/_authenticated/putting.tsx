import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Target,
  Play,
  StopCircle,
  MapPin,
  Crosshair,
  CheckCircle2,
  XCircle,
  Trophy,
  Sparkles,
  Flag,
  RotateCcw,
  Wind,
  RefreshCw,
} from "lucide-react";
import {
  buildDrills,
  evaluateDrill,
  bucketByDistance,
  haversineFt,
  suggestMarkers,
  type Drill,
  type PuttMarker,
  type PuttRecord,
} from "@/lib/putting-coaching";
import {
  SessionDiscPicker,
  type SessionDisc,
  type BagDiscOption,
} from "@/components/session-disc-picker";
import { fetchBagDiscs } from "@/lib/entities/bag";
import { PuttingGreenView } from "@/components/putting-green-view";
import { degToCompass, puttingWindTip } from "@/lib/wind-helpers";
import { useServerFn } from "@tanstack/react-start";
import { fetchWeatherForPoint } from "@/lib/data-connectors.functions";
import { PageShell } from "@/components/shell/page-shell";

const sb: any = supabase;

export const Route = createFileRoute("/_authenticated/putting")({
  component: PuttingPage,
  head: () => ({
    meta: [
      { title: "Putting green · Practice · DG Dashboard" },
      {
        name: "description",
        content:
          "Lock in a basket, drop distance markers at 15, 30, 40 and 50 feet, and grind coached putting drills to sharpen every look.",
      },
      { property: "og:title", content: "Putting green · Practice · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Coached putting drills with GPS-anchored distance markers, streaks and daily challenges.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Session = {
  id: string;
  user_id: string;
  name: string | null;
  location: string | null;
  basket_latitude: number | null;
  basket_longitude: number | null;
  wind_mph: number | null;
  wind_dir: string | null;
  conditions: string | null;
  wind_gust_mph: number | null;
  wind_deg: number | null;
  temperature_f: number | null;
  weather_synced_at: string | null;
  started_at: string;
  ended_at: string | null;
  markers: PuttMarker[] | null;
  completed_drills: string[] | null;
  session_discs: SessionDisc[] | null;
};

type Putt = {
  id: string;
  session_id: string;
  putt_index: number;
  distance_ft: number;
  made: boolean;
  disc_label: string | null;
  drill_id: string | null;
  putt_style: string | null;
  landed_latitude: number | null;
  landed_longitude: number | null;
  gps_accuracy_m: number | null;
  notes: string | null;
  created_at: string;
};

const PUTT_STYLES = [
  { value: "spin", label: "Spin Putt" },
  { value: "push", label: "Push Putt" },
  { value: "straddle", label: "Straddle" },
  { value: "turbo", label: "Turbo" },
  { value: "jump", label: "Jump Putt" },
  { value: "step", label: "Step Putt" },
];

const TARGET_DISTANCES = suggestMarkers();

function usePosition(active: boolean) {
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos(p);
        setErr(null);
      },
      (e) => setErr(e.message),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { pos, err };
}

function fmtFt(n: number) {
  return `${Math.round(n)} ft`;
}

function PuttingPage() {
  const { user } = useSession();
  const [session, setSession] = useState<Session | null>(null);
  const [putts, setPutts] = useState<Putt[]>([]);
  const [stage, setStage] = useState<"idle" | "basket" | "markers" | "practice">("idle");
  const [nextMarkerIdx, setNextMarkerIdx] = useState(0);
  const [selectedDrill, setSelectedDrill] = useState<string | null>(null);
  const [selectedDistance, setSelectedDistance] = useState<number>(20);
  const [discLabel, setDiscLabel] = useState<string>("");
  const [puttStyle, setPuttStyle] = useState<string>("spin");
  const [windMph, setWindMph] = useState<string>("");
  const [windDir, setWindDir] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { pos, err: geoErr } = usePosition(stage !== "idle");
  const [history, setHistory] = useState<Session[]>([]);
  const [bag, setBag] = useState<BagDiscOption[]>([]);
  const [pickedDiscs, setPickedDiscs] = useState<SessionDisc[]>([]);
  const fetchWeather = useServerFn(fetchWeatherForPoint);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!user || bootedRef.current) return;
    bootedRef.current = true;
    void refreshHistory();
    void loadBag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadBag() {
    if (!user) return;
    setBag((await fetchBagDiscs(user.id)) as BagDiscOption[]);
  }

  async function refreshHistory() {
    if (!user) return;
    const { data } = await sb
      .from("putting_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20);
    setHistory((data as Session[]) ?? []);
  }

  async function reloadPutts(sessionId: string) {
    const { data } = await sb
      .from("putting_putts")
      .select("*")
      .eq("session_id", sessionId)
      .order("putt_index", { ascending: true });
    setPutts((data as Putt[]) ?? []);
  }

  async function syncWeatherFor(sessionId: string, lat: number, lon: number) {
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
      await sb.from("putting_sessions").update(patch).eq("id", sessionId);
      setSession((s) => (s && s.id === sessionId ? { ...s, ...patch } : s));
      toast.success(
        `Weather synced — ${mph ?? "?"} mph${dir ? " " + dir : ""}${tempF != null ? " · " + tempF + "°F" : ""}`,
      );
    } catch (e) {
      toast.error("Couldn't fetch weather", { description: (e as Error).message });
    }
  }

  async function startSession() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await sb
        .from("putting_sessions")
        .insert({
          user_id: user.id,
          name: `Putting - ${new Date().toLocaleDateString()}`,
          markers: [],
          completed_drills: [],
          wind_mph: windMph ? Number(windMph) : null,
          wind_dir: windDir || null,
          session_discs: pickedDiscs,
        })
        .select("*")
        .single();
      if (error) throw error;
      setSession(data as Session);
      setPutts([]);
      setStage("basket");
    } catch (e) {
      toast.error("Could not start session", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function lockBasket() {
    if (!session || !pos) {
      toast.error("Waiting on GPS…");
      return;
    }
    const { latitude, longitude } = pos.coords;
    const { data, error } = await sb
      .from("putting_sessions")
      .update({ basket_latitude: latitude, basket_longitude: longitude })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) {
      toast.error("We couldn't lock the basket. Give it another shot.", {
        description: error.message,
      });
      return;
    }
    setSession(data as Session);
    setStage("markers");
    setNextMarkerIdx(0);
    toast.success("Basket locked", { description: "Walk out to drop your distance markers." });
    void syncWeatherFor((data as Session).id, latitude, longitude);
  }

  const basketPos =
    session && session.basket_latitude != null && session.basket_longitude != null
      ? { latitude: session.basket_latitude, longitude: session.basket_longitude }
      : null;

  const liveDistFromBasket = useMemo(() => {
    if (!pos || !basketPos) return null;
    return haversineFt(basketPos, {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
  }, [pos, basketPos]);

  async function dropMarker() {
    if (!session || !pos) return;
    const target = TARGET_DISTANCES[nextMarkerIdx];
    const marker: PuttMarker = {
      distance_ft: target,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      set_at: new Date().toISOString(),
    };
    const nextMarkers = [...(session.markers ?? []), marker];
    const { data, error } = await sb
      .from("putting_sessions")
      .update({ markers: nextMarkers })
      .eq("id", session.id)
      .select("*")
      .single();
    if (error) {
      toast.error("We couldn't save that marker. Give it another shot.", {
        description: error.message,
      });
      return;
    }
    setSession(data as Session);
    const nextIdx = nextMarkerIdx + 1;
    if (nextIdx >= TARGET_DISTANCES.length) {
      setStage("practice");
      setSelectedDistance(TARGET_DISTANCES[0]);
      toast.success("Markers set!", { description: "Pick a drill and start putting." });
    } else {
      setNextMarkerIdx(nextIdx);
      toast.success(`Marker ${target} ft saved`, {
        description: `Walk to ~${TARGET_DISTANCES[nextIdx]} ft for the next drop.`,
      });
    }
  }

  function skipMarkers() {
    setStage("practice");
    setSelectedDistance(TARGET_DISTANCES[0]);
  }

  async function logPutt(made: boolean) {
    if (!session) return;
    let dist = selectedDistance;
    // If GPS + basket are anchored, override with live measurement to the player's spot.
    if (basketPos && pos) {
      const live = haversineFt(basketPos, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (live > 5 && live < 200) dist = Math.round(live);
    }
    const nextIndex = putts.length;
    const { data, error } = await sb
      .from("putting_putts")
      .insert({
        session_id: session.id,
        user_id: session.user_id,
        putt_index: nextIndex,
        distance_ft: dist,
        made,
        disc_label: discLabel || null,
        drill_id: selectedDrill,
        putt_style: puttStyle,
        landed_latitude: pos?.coords.latitude ?? null,
        landed_longitude: pos?.coords.longitude ?? null,
        gps_accuracy_m: pos?.coords.accuracy ?? null,
      })
      .select("*")
      .single();
    if (error) {
      toast.error("Log failed", { description: error.message });
      return;
    }
    const next = [...putts, data as Putt];
    setPutts(next);

    // Check if the active drill just completed.
    if (selectedDrill && session.markers) {
      const drill = buildDrills(session.markers).find((d) => d.id === selectedDrill);
      if (drill && !(session.completed_drills ?? []).includes(drill.id)) {
        const records: PuttRecord[] = next.map((p) => ({
          distance_ft: p.distance_ft,
          made: p.made,
          drill_id: p.drill_id,
          created_at: p.created_at,
        }));
        const progress = evaluateDrill(drill, records);
        if (progress.complete) {
          const completed = [...(session.completed_drills ?? []), drill.id];
          await sb
            .from("putting_sessions")
            .update({ completed_drills: completed })
            .eq("id", session.id);
          setSession({ ...session, completed_drills: completed });
          toast.success(`Drill complete — ${drill.title}`, {
            description: drill.achievement
              ? `Achievement unlocked: ${drill.achievement}`
              : `+${drill.reward_xp} XP earned. Nice work!`,
          });
        }
      }
    }
  }

  async function undoLast() {
    if (!session || putts.length === 0) return;
    const last = putts[putts.length - 1];
    const { error } = await sb.from("putting_putts").delete().eq("id", last.id);
    if (error) {
      toast.error("Undo failed", { description: error.message });
      return;
    }
    setPutts(putts.slice(0, -1));
  }

  async function endSession() {
    if (!session) return;
    await sb
      .from("putting_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", session.id);
    toast.success("Session saved");
    setSession(null);
    setPutts([]);
    setStage("idle");
    void refreshHistory();
  }

  const drills = useMemo<Drill[]>(
    () => (session?.markers?.length ? buildDrills(session.markers) : []),
    [session?.markers],
  );
  const records = useMemo<PuttRecord[]>(
    () =>
      putts.map((p) => ({
        distance_ft: p.distance_ft,
        made: p.made,
        drill_id: p.drill_id,
        created_at: p.created_at,
      })),
    [putts],
  );
  const buckets = useMemo(() => bucketByDistance(records), [records]);
  const totalMakes = records.filter((r) => r.made).length;
  const totalPutts = records.length;
  const overallPct = totalPutts ? Math.round((totalMakes / totalPutts) * 100) : 0;

  const activeDrill = selectedDrill ? drills.find((d) => d.id === selectedDrill) : null;
  const activeProgress = activeDrill ? evaluateDrill(activeDrill, records) : null;

  // ─────────────────────────── UI ───────────────────────────

  if (!session || stage === "idle") {
    return (
      <PageShell>
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Digital Putting Green</h1>
              <p className="text-sm text-muted-foreground">
                GPS-anchored putting drills with coached progression.
              </p>
            </div>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a new putting session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Wind (mph)</Label>
                <Input
                  inputMode="decimal"
                  value={windMph}
                  onChange={(e) => setWindMph(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label>Wind direction</Label>
                <Input
                  value={windDir}
                  onChange={(e) => setWindDir(e.target.value)}
                  placeholder="e.g. N, ESE"
                />
              </div>
              <div className="space-y-1">
                <Label>Default disc</Label>
                <Input
                  value={discLabel}
                  onChange={(e) => setDiscLabel(e.target.value)}
                  placeholder="e.g. Zone, Luna"
                />
              </div>
            </div>
            <SessionDiscPicker
              bag={bag}
              value={pickedDiscs}
              onChange={setPickedDiscs}
              mode="putting"
              title="Putters for this session (pick multiple, set quantities)"
            />
            <Button size="lg" onClick={startSession} disabled={loading} className="w-full">
              <Play className="mr-2 h-4 w-4" /> Start Session
            </Button>
            <p className="text-xs text-muted-foreground">
              We'll auto-sync wind + temperature from your basket GPS. You'll lock the basket, drop
              markers at {TARGET_DISTANCES.join(", ")} ft, then work coached drills.
            </p>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{s.name ?? "Putting session"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.started_at).toLocaleString()}
                      {s.completed_drills?.length
                        ? ` • ${s.completed_drills.length} drills complete`
                        : ""}
                    </div>
                  </div>
                  <Badge variant="outline">{(s.markers ?? []).length} markers</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </PageShell>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Digital Putting Green</h1>
            <p className="text-xs text-muted-foreground">
              GPS accuracy {pos?.coords.accuracy ? `±${Math.round(pos.coords.accuracy)} m` : "…"}
              {geoErr ? ` • ${geoErr}` : ""}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={endSession}>
          <StopCircle className="mr-2 h-4 w-4" /> End Session
        </Button>
      </header>

      {stage === "basket" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flag className="h-4 w-4" /> Step 1 — Lock the basket
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Walk right up to the chains, hold still for a moment, then tap Lock Basket. This is
              the reference point for every marker and putt.
            </p>
            {pos ? (
              <div className="rounded-md border p-3 text-sm">
                <div>
                  Lat: {pos.coords.latitude.toFixed(6)} • Lng: {pos.coords.longitude.toFixed(6)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Accuracy ±{Math.round(pos.coords.accuracy)} m
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for GPS fix…</p>
            )}
            <Button onClick={lockBasket} disabled={!pos} size="lg" className="w-full">
              <MapPin className="mr-2 h-4 w-4" /> Lock Basket at My Location
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "markers" && session && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Crosshair className="h-4 w-4" /> Step 2 — Drop marker at{" "}
              {TARGET_DISTANCES[nextMarkerIdx]} ft
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs uppercase text-muted-foreground">
                Live distance from basket
              </div>
              <div className="text-3xl font-semibold">
                {liveDistFromBasket != null ? fmtFt(liveDistFromBasket) : "—"}
              </div>
              {liveDistFromBasket != null && (
                <div className="mt-1 text-sm text-primary">
                  {Math.abs(liveDistFromBasket - TARGET_DISTANCES[nextMarkerIdx]) <= 2
                    ? "You're on the spot — drop the marker!"
                    : liveDistFromBasket < TARGET_DISTANCES[nextMarkerIdx]
                      ? `Keep walking back — ${fmtFt(TARGET_DISTANCES[nextMarkerIdx] - liveDistFromBasket)} more.`
                      : `Step forward — ${fmtFt(liveDistFromBasket - TARGET_DISTANCES[nextMarkerIdx])} closer.`}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {TARGET_DISTANCES.map((d, i) => {
                const done = i < nextMarkerIdx;
                const active = i === nextMarkerIdx;
                return (
                  <Badge key={d} variant={done ? "default" : active ? "secondary" : "outline"}>
                    {done ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                    {d} ft
                  </Badge>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={dropMarker} disabled={!pos} size="lg">
                <MapPin className="mr-2 h-4 w-4" /> Drop marker here
              </Button>
              <Button variant="ghost" onClick={skipMarkers}>
                Skip and start putting
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "practice" && session && (
        <>
          {(() => {
            const tip = puttingWindTip(
              session.wind_mph,
              session.wind_gust_mph,
              degToCompass(session.wind_deg),
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
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs uppercase tracking-wide font-semibold flex items-center gap-1">
                    <Wind className="h-3 w-3" /> Putt coach
                  </div>
                  {session.basket_latitude != null && session.basket_longitude != null && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        syncWeatherFor(
                          session.id,
                          session.basket_latitude!,
                          session.basket_longitude!,
                        )
                      }
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                    </Button>
                  )}
                </div>
                <div className="font-semibold">{tip.title}</div>
                <div className="text-sm text-muted-foreground">{tip.detail}</div>
                {session.temperature_f != null && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {session.temperature_f}°F ambient · synced{" "}
                    {session.weather_synced_at
                      ? new Date(session.weather_synced_at).toLocaleTimeString()
                      : ""}
                  </div>
                )}
              </div>
            );
          })()}

          <PuttingGreenView
            basketLat={session.basket_latitude}
            basketLon={session.basket_longitude}
            markers={(session.markers ?? []).map((m) => ({
              distance_ft: m.distance_ft,
              latitude: m.latitude,
              longitude: m.longitude,
            }))}
            putts={putts.map((p) => ({
              id: p.id,
              distance_ft: p.distance_ft,
              made: p.made,
              landed_latitude: p.landed_latitude,
              landed_longitude: p.landed_longitude,
              created_at: p.created_at,
            }))}
            playerLat={pos?.coords.latitude ?? null}
            playerLon={pos?.coords.longitude ?? null}
            windDeg={session.wind_deg}
            windMph={session.wind_mph}
            windFrom={degToCompass(session.wind_deg)}
            gustMph={session.wind_gust_mph}
            selectedDistance={selectedDistance}
            onSelectStation={(d) => setSelectedDistance(d)}
            onAddStation={async (d) => {
              if (!session) return;
              const anchor = pos ?? null;
              const marker: PuttMarker = {
                distance_ft: d,
                latitude: anchor?.coords.latitude ?? session.basket_latitude ?? 0,
                longitude: anchor?.coords.longitude ?? session.basket_longitude ?? 0,
                set_at: new Date().toISOString(),
              };
              const nextMarkers = [
                ...(session.markers ?? []).filter((m) => m.distance_ft !== d),
                marker,
              ];
              const { data, error } = await sb
                .from("putting_sessions")
                .update({ markers: nextMarkers })
                .eq("id", session.id)
                .select("*")
                .single();
              if (error) {
                toast.error("We couldn't add that station. Give it another shot.", {
                  description: error.message,
                });
                return;
              }
              setSession(data as Session);
              setSelectedDistance(d);
              toast.success(`Station added at ${d} ft`);
            }}
            onRemoveStation={async (d) => {
              if (!session) return;
              const nextMarkers = (session.markers ?? []).filter((m) => m.distance_ft !== d);
              const { data, error } = await sb
                .from("putting_sessions")
                .update({ markers: nextMarkers })
                .eq("id", session.id)
                .select("*")
                .single();
              if (error) {
                toast.error("We couldn't remove that station. Give it another shot.", {
                  description: error.message,
                });
                return;
              }
              setSession(data as Session);
              toast.info(`Station ${d} ft removed`);
            }}
            onQuickMake={() => logPutt(true)}
            onQuickMiss={() => logPutt(false)}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Coached drills
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {drills.map((d) => {
                  const p = evaluateDrill(d, records);
                  const done = (session.completed_drills ?? []).includes(d.id) || p.complete;
                  const isActive = selectedDrill === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setSelectedDrill(d.id);
                        setSelectedDistance(d.target_distance_ft);
                      }}
                      className={`rounded-lg border p-3 text-left transition ${
                        isActive
                          ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{d.title}</div>
                          <div className="text-xs text-muted-foreground">
                            Target ≈ {d.target_distance_ft} ft • +{d.reward_xp} XP
                          </div>
                        </div>
                        {done ? (
                          <Badge className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{d.coach}</p>
                      <div className="mt-2 space-y-1">
                        <Progress
                          value={p.progressPct}
                          aria-label={`${d.title} progress`}
                          aria-valuetext={`${Math.round(p.progressPct)} percent`}
                        />
                        <div className="text-[11px] text-muted-foreground">
                          {d.category === "streak" || d.category === "pressure"
                            ? `Best streak ${p.bestStreak} / ${d.goal_makes}`
                            : `${p.makes} / ${d.goal_makes} makes`}
                          {p.total ? ` • ${p.total} attempts` : ""}
                        </div>
                      </div>
                      {d.achievement && (
                        <div className="mt-2 flex items-center gap-1 text-[11px] text-primary">
                          <Trophy className="h-3 w-3" /> Unlocks: {d.achievement}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> Log putt
                {activeDrill && (
                  <Badge variant="secondary" className="ml-2">
                    Drill: {activeDrill.title}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">You are</div>
                    <div className="text-3xl font-semibold">
                      {liveDistFromBasket != null
                        ? fmtFt(liveDistFromBasket)
                        : `${selectedDistance} ft`}
                    </div>
                    <div className="text-xs text-muted-foreground">from the chains</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase text-muted-foreground">This session</div>
                    <div className="text-2xl font-semibold">
                      {totalMakes}/{totalPutts}
                    </div>
                    <div className="text-xs text-muted-foreground">{overallPct}% overall</div>
                  </div>
                </div>
                {activeProgress && activeDrill && (
                  <div className="mt-3 space-y-1">
                    <Progress
                      value={activeProgress.progressPct}
                      aria-label="Active drill progress"
                      aria-valuetext={`${Math.round(activeProgress.progressPct)} percent`}
                    />
                    <div className="text-[11px] text-muted-foreground">
                      {activeDrill.category === "streak" || activeDrill.category === "pressure"
                        ? `Streak ${activeProgress.currentStreak} • Best ${activeProgress.bestStreak} / ${activeDrill.goal_makes}`
                        : `${activeProgress.makes} / ${activeDrill.goal_makes} makes`}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Distance (ft)</Label>
                  <Select
                    value={String(selectedDistance)}
                    onValueChange={(v) => setSelectedDistance(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 15, 20, 25, 30, 33, 35, 40, 45, 50, 55, 60, 66].map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} ft
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Putt style</Label>
                  <Select value={puttStyle} onValueChange={setPuttStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUTT_STYLES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Disc</Label>
                  <Input
                    value={discLabel}
                    onChange={(e) => setDiscLabel(e.target.value)}
                    placeholder="e.g. Zone"
                  />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Button size="lg" className="h-16 text-lg" onClick={() => logPutt(true)}>
                  <CheckCircle2 className="mr-2 h-5 w-5" /> Made
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-16 text-lg"
                  onClick={() => logPutt(false)}
                >
                  <XCircle className="mr-2 h-5 w-5" /> Missed
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={undoLast} disabled={!putts.length}>
                  <RotateCcw className="mr-2 h-3 w-3" /> Undo last
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDrill(null)}
                  disabled={!selectedDrill}
                >
                  Free-throw mode
                </Button>
                {(session.wind_mph || session.wind_dir) && (
                  <Badge variant="outline" className="ml-auto">
                    <Wind className="mr-1 h-3 w-3" /> {session.wind_mph ?? "?"} mph{" "}
                    {session.wind_dir ?? ""}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session breakdown by distance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-5">
                {buckets.map((b) => (
                  <div key={b.bucket} className="rounded-md border p-3 text-center">
                    <div className="text-xs uppercase text-muted-foreground">{b.bucket}</div>
                    <div className="mt-1 text-2xl font-semibold">{b.pct}%</div>
                    <div className="text-xs text-muted-foreground">
                      {b.makes} / {b.total} made
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
