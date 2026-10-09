import { useCallback, useEffect, useState } from "react";

/**
 * Personalization for the DGIM messenger app. Preferences are per-device and
 * persist in localStorage so the popup and the full-page app agree.
 */
export type MessengerDensity = "comfortable" | "compact";
export type MessengerFontScale = "sm" | "md" | "lg";
export type MessengerWallpaper = "none" | "fairway" | "chains" | "dusk";
export type MessengerLane = "social" | "event";

export type MessengerPrefs = {
  density: MessengerDensity;
  fontScale: MessengerFontScale;
  wallpaper: MessengerWallpaper;
  defaultLane: MessengerLane;
  showTimestamps: boolean;
  showReadReceipts: boolean;
  sendOnEnter: boolean;
  soundOnNewMessage: boolean;
  desktopNotifications: boolean;
};

export const DEFAULT_MESSENGER_PREFS: MessengerPrefs = {
  density: "comfortable",
  fontScale: "md",
  wallpaper: "none",
  defaultLane: "social",
  showTimestamps: true,
  showReadReceipts: true,
  sendOnEnter: true,
  soundOnNewMessage: false,
  desktopNotifications: false,
};

const STORAGE_KEY = "dgd:dgim:prefs:v1";
const listeners = new Set<() => void>();
let cache: MessengerPrefs | null = null;

function read(): MessengerPrefs {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULT_MESSENGER_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw
      ? { ...DEFAULT_MESSENGER_PREFS, ...(JSON.parse(raw) as Partial<MessengerPrefs>) }
      : DEFAULT_MESSENGER_PREFS;
  } catch {
    cache = DEFAULT_MESSENGER_PREFS;
  }
  return cache;
}

/** Read + update messenger preferences. Safe during SSR (returns defaults). */
export function useMessengerPrefs() {
  const [prefs, setPrefs] = useState<MessengerPrefs>(DEFAULT_MESSENGER_PREFS);

  useEffect(() => {
    setPrefs(read());
    const onChange = () => setPrefs(read());
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const update = useCallback((patch: Partial<MessengerPrefs>) => {
    cache = { ...read(), ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // Storage can be unavailable (private mode); prefs still apply this session.
    }
    listeners.forEach((l) => l());
  }, []);

  const reset = useCallback(() => {
    cache = { ...DEFAULT_MESSENGER_PREFS };
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  }, []);

  return { prefs, update, reset };
}

export const MESSAGE_TEXT_CLASS: Record<MessengerFontScale, string> = {
  sm: "text-[13px]",
  md: "text-sm",
  lg: "text-base",
};

export const THREAD_SPACING_CLASS: Record<MessengerDensity, string> = {
  comfortable: "space-y-2 p-3",
  compact: "space-y-1 p-2",
};

export const WALLPAPER_CLASS: Record<MessengerWallpaper, string> = {
  none: "",
  fairway: "bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.07),transparent_60%)]",
  chains: "bg-[linear-gradient(180deg,hsl(var(--muted)/0.5),transparent)]",
  dusk: "bg-[linear-gradient(160deg,hsl(var(--primary)/0.08),hsl(var(--muted)/0.35))]",
};
