import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptPoint, computeWalk, type TrackPoint, type WalkTotals } from "@/lib/round-walk";

const FLUSH_MS = 30_000;
const keyFor = (roundId: string) => `dgd-walk-${roundId}`;

/**
 * Follows the phone's location for the whole round and saves the walked path
 * (only when the player turns it on). Browsers pause location while the
 * screen is off, so the path has gaps rather than invented straight lines.
 */
export function useRoundWalk(roundId: string, userId: string | null, active: boolean) {
  const [enabled, setEnabledState] = useState(false);
  const [totals, setTotals] = useState<WalkTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const points = useRef<TrackPoint[]>([]);
  const dirty = useRef(false);

  useEffect(() => {
    setEnabledState(localStorage.getItem(keyFor(roundId)) === "1");
  }, [roundId]);

  // Resume an existing path for this round.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("round_tracks")
      .select("points")
      .eq("round_id", roundId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.points && Array.isArray(data.points) && !points.current.length) {
          points.current = data.points as unknown as TrackPoint[];
          setTotals(computeWalk(points.current));
        }
      });
  }, [roundId, userId]);

  const flush = useCallback(async () => {
    if (!dirty.current || !userId) return;
    dirty.current = false;
    const t = computeWalk(points.current);
    const { error: e } = await supabase.from("round_tracks").upsert(
      { round_id: roundId, user_id: userId, points: points.current as unknown as never, ...t, updated_at: new Date().toISOString() },
      { onConflict: "round_id,user_id" },
    );
    if (e) {
      dirty.current = true;
      setError("Your walk couldn't be saved yet — we'll keep trying.");
    } else setError(null);
  }, [roundId, userId]);

  useEffect(() => {
    if (!enabled || !active || !userId || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p: TrackPoint = [pos.coords.latitude, pos.coords.longitude, pos.coords.altitude ?? null, pos.timestamp];
        if (!acceptPoint(points.current[points.current.length - 1], p, pos.coords.accuracy ?? null)) return;
        points.current.push(p);
        dirty.current = true;
        setTotals(computeWalk(points.current));
      },
      () => setError("Location is off — turn it on to track your walk."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    const iv = window.setInterval(() => void flush(), FLUSH_MS);
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [enabled, active, userId, flush]);

  const setEnabled = (on: boolean) => {
    localStorage.setItem(keyFor(roundId), on ? "1" : "0");
    setEnabledState(on);
  };

  return { enabled, setEnabled, totals, error, flush };
}
