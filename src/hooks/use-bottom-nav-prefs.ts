import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

const STORAGE_KEY = "dgd.bottom-nav.v1";
const PREF_KEY = "bottom-nav";

/**
 * How many buttons fit in the phone bottom bar beside "More" — two rows of
 * four, with "More" holding the eighth slot.
 */
export const BOTTOM_NAV_SLOTS = 7;

function sanitize(keys: unknown, allowed: string[]): string[] {
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((k): k is string => typeof k === "string" && allowed.includes(k))
    .filter((k, i, arr) => arr.indexOf(k) === i)
    .slice(0, BOTTOM_NAV_SLOTS);
}

function readLocal(allowed: string[]): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw), allowed) : [];
  } catch {
    return [];
  }
}

function writeLocal(keys: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* private browsing — the choice just won't persist here */
  }
}

/**
 * Which sections a player has chosen for the phone bottom bar.
 *
 * Order of preference: the player's own saved choice (stored on their account
 * so it follows them to every device), then the app-wide default an admin set,
 * then the stock sections shipped with the app.
 */
export function useBottomNavPrefs(allowed: string[], fallback: string[]) {
  const { user } = useSession();
  const [mine, setMine] = useState<string[] | null>(null);
  const [appDefault, setAppDefault] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const allowedKey = allowed.join(",");

  // Read after hydration so server and client markup match on first paint.
  useEffect(() => {
    let active = true;
    const local = readLocal(allowedRef.current);
    if (local.length > 0) setMine(local);

    (async () => {
      const [defaultRes, mineRes] = await Promise.all([
        supabase.from("app_bottom_nav_default").select("keys").maybeSingle(),
        user
          ? supabase
              .from("user_dashboard_prefs")
              .select("widget_order")
              .eq("user_id", user.id)
              .eq("dashboard_key", PREF_KEY)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      const appKeys = sanitize(defaultRes.data?.keys, allowedRef.current);
      setAppDefault(appKeys.length > 0 ? appKeys : null);
      const saved = sanitize(
        (mineRes.data as { widget_order?: string[] } | null)?.widget_order,
        allowedRef.current,
      );
      if (saved.length > 0) {
        setMine(saved);
        writeLocal(saved);
      }
      setReady(true);
    })().catch(() => {
      if (active) setReady(true);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, allowedKey]);

  const keys = mine ?? appDefault ?? fallback;

  const save = useCallback(
    async (next: string[]) => {
      const trimmed = sanitize(next, allowedRef.current);
      if (trimmed.length === 0) return;
      setMine(trimmed);
      writeLocal(trimmed);
      if (!user) return;
      await supabase.from("user_dashboard_prefs").upsert(
        {
          user_id: user.id,
          dashboard_key: PREF_KEY,
          widget_order: trimmed,
        },
        { onConflict: "user_id,dashboard_key" },
      );
    },
    [user?.id],
  );

  const reset = useCallback(async () => {
    setMine(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (!user) return;
    await supabase
      .from("user_dashboard_prefs")
      .delete()
      .eq("user_id", user.id)
      .eq("dashboard_key", PREF_KEY);
  }, [user?.id]);

  /** Admins only: make the current selection the starting bar for everyone. */
  const saveAsAppDefault = useCallback(
    async (next: string[]) => {
      const trimmed = sanitize(next, allowedRef.current);
      if (trimmed.length === 0) return false;
      const { error } = await supabase.from("app_bottom_nav_default").upsert(
        {
          id: true,
          keys: trimmed,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) return false;
      setAppDefault(trimmed);
      return true;
    },
    [user?.id],
  );

  return { keys, save, reset, ready, saveAsAppDefault, appDefault };
}
