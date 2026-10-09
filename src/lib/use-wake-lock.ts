import { useEffect, useState } from "react";

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> };

/**
 * Keep the screen awake while a round is being scored. Re-acquires the lock
 * when the tab returns to the foreground (browsers drop it on blur).
 * Returns whether the lock is currently held so the UI can show a toggle state.
 */
export function useWakeLock(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") {
      setHeld(false);
      return;
    }
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } })
      .wakeLock;
    if (!wl) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await wl.request("screen");
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        setHeld(true);
      } catch {
        setHeld(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      setHeld(false);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    };
  }, [enabled]);

  return held;
}

/** Short confirmation buzz for stroke changes and hole advances. */
export function tapHaptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try {
    nav.vibrate?.(pattern as number & number[]);
  } catch {
    // Haptics unsupported — silent.
  }
}
