import { useCallback, useEffect, useState } from "react";

/**
 * Per-conversation messenger flags (pinned to the top, muted alerts).
 * Stored in this browser so the list order and alert behavior follow the player
 * without adding a server round trip on every chat open.
 */

export type ConvFlags = { pinned: string[]; muted: string[] };

const STORAGE_KEY = "dgd:dgim:conv-flags:v1";
const EVENT = "dgd:dgim:conv-flags";

export const EMPTY_CONV_FLAGS: ConvFlags = { pinned: [], muted: [] };

function read(): ConvFlags {
  if (typeof window === "undefined") return EMPTY_CONV_FLAGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CONV_FLAGS;
    const parsed = JSON.parse(raw) as Partial<ConvFlags>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((v) => typeof v === "string") : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted.filter((v) => typeof v === "string") : [],
    };
  } catch {
    return EMPTY_CONV_FLAGS;
  }
}

function write(next: ConvFlags) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can block storage; the flags simply reset next visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

export function useConvFlags() {
  const [flags, setFlags] = useState<ConvFlags>(EMPTY_CONV_FLAGS);

  useEffect(() => {
    setFlags(read());
    const sync = () => setFlags(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const togglePinned = useCallback((id: string) => {
    const next = read();
    write({ ...next, pinned: toggle(next.pinned, id) });
  }, []);

  const toggleMuted = useCallback((id: string) => {
    const next = read();
    write({ ...next, muted: toggle(next.muted, id) });
  }, []);

  const isPinned = useCallback((id: string) => flags.pinned.includes(id), [flags.pinned]);
  const isMuted = useCallback((id: string) => flags.muted.includes(id), [flags.muted]);

  return { flags, togglePinned, toggleMuted, isPinned, isMuted };
}
