import { useCallback, useEffect, useState } from "react";

/**
 * Single source of truth for the player's DG Dashboard target rating.
 *
 * Set from the "Crush your goals" planner on DG Statboard, then read by
 * every other tool in the app (Game Plan, Face Off, Past Event dialog,
 * Course Mastery, Round Companion) so a change in one place propagates
 * everywhere without prop drilling.
 *
 * Persisted in localStorage and synchronized across components in the
 * same tab via a CustomEvent, and across tabs via the storage event.
 */

const KEY = "dgd:target-rating";
const EVENT = "dgd:target-rating:changed";

export function readTargetRating(): number | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  const n = v != null ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function writeTargetRating(n: number | null) {
  if (typeof window === "undefined") return;
  if (n == null || !Number.isFinite(n)) {
    window.localStorage.removeItem(KEY);
  } else {
    window.localStorage.setItem(KEY, String(Math.round(n)));
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: n }));
}

export function useTargetRating(
  fallback?: number | null,
): [number | null, (n: number | null) => void] {
  const [value, setValue] = useState<number | null>(() => readTargetRating() ?? fallback ?? null);

  useEffect(() => {
    function onChange() {
      setValue(readTargetRating());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setValue(readTargetRating());
    }
    window.addEventListener(EVENT, onChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const set = useCallback((n: number | null) => {
    writeTargetRating(n);
    setValue(n);
  }, []);

  return [value, set];
}
