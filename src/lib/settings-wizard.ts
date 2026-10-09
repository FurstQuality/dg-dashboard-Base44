/**
 * Settings setup wizard — shared step order and readiness signals.
 *
 * The Settings area is presented as an ordered walkthrough: identity first,
 * then connected data sources, then calendar, then preferences. Pages that
 * depend on an earlier step (for example calendar syncing, which needs a
 * linked PDGA or UDisc account) read `useSettingsSetup()` so they can point
 * the player back to the step they still need to finish.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

export const SETTINGS_STEPS = [
  {
    to: "/settings/profile",
    label: "Player details",
    description: "Name, home course, PDGA number",
    /** One plain-language instruction shown on the step and the overview. */
    todo: "Type the name you want other players to see. Everything else is optional.",
    minutes: 2,
    /** Verified from saved data instead of a manual "done" tap. */
    verified: true,
  },
  {
    to: "/settings/imports",
    label: "Data & sync",
    description: "PDGA, UDisc, course ratings",
    todo: "Add your PDGA number or paste a UDisc profile link, then tap Sync now.",
    minutes: 3,
    verified: true,
  },
  {
    to: "/settings/calendar",
    label: "Calendar",
    description: "Feeds and event sources",
    todo: "Subscribe to your calendar feed so tee times land on your phone.",
    minutes: 2,
    verified: true,
  },
  {
    to: "/settings/notifications",
    label: "Notifications",
    description: "Push, email, quiet hours",
    todo: "Pick what you want to hear about, then mark this step done.",
    minutes: 1,
    verified: false,
  },
  {
    to: "/settings/privacy",
    label: "Privacy",
    description: "Who can see your game",
    todo: "Choose who can see your rounds and ratings — the defaults are safe.",
    minutes: 1,
    verified: false,
  },
  {
    to: "/settings/personalization",
    label: "Look & feel",
    description: "Theme, density, text size",
    todo: "Set light or dark mode and how big you want text.",
    minutes: 1,
    verified: false,
  },
  {
    to: "/settings/billing",
    label: "Subscription",
    description: "Plan, invoices, IAP",
    todo: "Stay on the free plan or upgrade — you can change this any time.",
    minutes: 1,
    verified: false,
  },
] as const;

export type SettingsStepPath = (typeof SETTINGS_STEPS)[number]["to"];

export function settingsStep(to: string) {
  return SETTINGS_STEPS.find((s) => s.to === to) ?? null;
}



export type SettingsSetup = {
  loading: boolean;
  /** Display name is filled in, so the rest of the app has something to show. */
  hasIdentity: boolean;
  /** At least one external source is linked — required before calendar syncing works. */
  hasConnectedSource: boolean;
  pdgaNumber: string | null;
  udiscProfileUrl: string | null;
  /** Rounds already pulled in from PDGA or UDisc. */
  importedRounds: number;
};

export function useSettingsSetup(): SettingsSetup {
  const { user } = useSession();

  const q = useQuery({
    enabled: !!user,
    queryKey: ["settings-setup", user?.id],
    staleTime: 30_000,
    queryFn: async () => {
      const uid = user!.id;
      const [profile, imported] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, pdga_number, udisc_profile_url, scene_profile_url")
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("external_rounds")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid),
      ]);
      const p = profile.data;
      return {
        displayName: (p?.display_name ?? "").trim(),
        pdgaNumber: p?.pdga_number ?? null,
        udiscProfileUrl: p?.udisc_profile_url ?? null,
        sceneProfileUrl: p?.scene_profile_url ?? null,
        importedRounds: imported.count ?? 0,
      };
    },
  });

  const d = q.data;
  return {
    loading: q.isLoading,
    hasIdentity: Boolean(d?.displayName),
    hasConnectedSource: Boolean(d?.pdgaNumber || d?.udiscProfileUrl || d?.sceneProfileUrl),
    pdgaNumber: d?.pdgaNumber ?? null,
    udiscProfileUrl: d?.udiscProfileUrl ?? null,
    importedRounds: d?.importedRounds ?? 0,
  };
}

/** Data-verified completion for the steps we can check ourselves. */
export function stepComplete(to: string, setup: SettingsSetup): boolean {
  if (to === "/settings/profile") return setup.hasIdentity;
  if (to === "/settings/imports") return setup.hasConnectedSource;
  if (to === "/settings/calendar") return setup.hasConnectedSource && setup.importedRounds > 0;
  return false;
}

/* -------------------------------------------------------------------------- */
/* Manual progress: "mark done" and "skip", persisted on this device.         */
/* -------------------------------------------------------------------------- */

export type StepState = "done" | "skipped" | "todo";

export type SetupProgress = {
  done: string[];
  skipped: string[];
};

export type SetupProgressApi = SetupProgress & {
  markDone: (to: string) => void;
  skip: (to: string) => void;
  reset: (to: string) => void;
  resetAll: () => void;
};

const PROGRESS_KEY = "dgd.settings.setup-progress";

function storageKey(userId: string | undefined) {
  return userId ? `${PROGRESS_KEY}.${userId}` : PROGRESS_KEY;
}

function readProgress(key: string): SetupProgress {
  if (typeof window === "undefined") return { done: [], skipped: [] };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { done: [], skipped: [] };
    const parsed = JSON.parse(raw) as Partial<SetupProgress>;
    return {
      done: Array.isArray(parsed.done) ? parsed.done.filter((v) => typeof v === "string") : [],
      skipped: Array.isArray(parsed.skipped)
        ? parsed.skipped.filter((v) => typeof v === "string")
        : [],
    };
  } catch {
    return { done: [], skipped: [] };
  }
}

/**
 * Setup progress the player controls directly: any step can be marked done or
 * skipped, and a skipped step can be reopened later.
 *
 * Progress lives on the player's account (profiles.setup_progress) so the
 * walkthrough follows them to every device they sign in on. The device copy is
 * kept as an instant-render cache and as the source for a one-time hand-off of
 * progress made before accounts stored it.
 */
export function useSetupProgress(): SetupProgressApi {
  const { user } = useSession();
  const userId = user?.id;
  const key = storageKey(userId);
  const [progress, setProgress] = useState<SetupProgress>({ done: [], skipped: [] });

  // Instant paint from the device cache while the account copy loads.
  useEffect(() => {
    setProgress(readProgress(key));
  }, [key]);

  const { data: remote } = useQuery({
    queryKey: ["settings", "setup-progress", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<SetupProgress> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("setup_progress")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      const raw = (data?.setup_progress ?? {}) as Partial<SetupProgress>;
      return {
        done: Array.isArray(raw.done) ? raw.done.filter((v) => typeof v === "string") : [],
        skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((v) => typeof v === "string") : [],
      };
    },
  });

  const persist = useCallback(
    (next: SetupProgress) => {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage unavailable — the account copy is still authoritative */
        }
      }
      if (!userId) return;
      void supabase.from("profiles").update({ setup_progress: next }).eq("id", userId);
    },
    [key, userId],
  );

  // One-time hand-off: anything already settled on this device is folded into
  // the account copy the first time it loads.
  useEffect(() => {
    if (!remote || !userId) return;
    const local = readProgress(key);
    const merged: SetupProgress = {
      done: Array.from(new Set([...remote.done, ...local.done])),
      skipped: Array.from(new Set([...remote.skipped, ...local.skipped])).filter(
        (s) => !remote.done.includes(s) && !local.done.includes(s),
      ),
    };
    setProgress(merged);
    const changed =
      merged.done.length !== remote.done.length || merged.skipped.length !== remote.skipped.length;
    if (changed) persist(merged);
  }, [remote, userId, key, persist]);

  const write = useCallback(
    (next: SetupProgress) => {
      setProgress(next);
      persist(next);
    },
    [persist],
  );

  const markDone = useCallback(
    (to: string) =>
      write({
        done: Array.from(new Set([...progress.done, to])),
        skipped: progress.skipped.filter((s) => s !== to),
      }),
    [progress, write],
  );

  const skip = useCallback(
    (to: string) =>
      write({
        done: progress.done.filter((s) => s !== to),
        skipped: Array.from(new Set([...progress.skipped, to])),
      }),
    [progress, write],
  );

  const reset = useCallback(
    (to: string) =>
      write({
        done: progress.done.filter((s) => s !== to),
        skipped: progress.skipped.filter((s) => s !== to),
      }),
    [progress, write],
  );

  const resetAll = useCallback(() => write({ done: [], skipped: [] }), [write]);

  return { ...progress, markDone, skip, reset, resetAll };
}

/**
 * Final state of a step: verified from saved data first, then the player's
 * own "done" mark, then "skipped".
 */
export function stepState(to: string, setup: SettingsSetup, progress: SetupProgress): StepState {
  if (stepComplete(to, setup)) return "done";
  if (progress.done.includes(to)) return "done";
  if (progress.skipped.includes(to)) return "skipped";
  return "todo";
}

/** A step counts as settled once it's done or deliberately skipped. */
export function stepSettled(state: StepState): boolean {
  return state === "done" || state === "skipped";
}

