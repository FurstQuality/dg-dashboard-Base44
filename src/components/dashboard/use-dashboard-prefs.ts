import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import type { DashboardDefinition, DashboardPrefsRow, WidgetRegistry, WidgetSize } from "./types";

type State = {
  order: string[];
  hidden: string[];
  sizes: Record<string, WidgetSize>;
  preset: string | null;
};

function mergeWithDefaults(
  def: DashboardDefinition,
  registry: WidgetRegistry,
  saved: DashboardPrefsRow | null,
): State {
  const registryIds = Object.keys(registry);
  const knownDefault = def.defaultOrder.filter((id) => registryIds.includes(id));

  if (!saved || saved.layout_version < def.layoutVersion) {
    return {
      order: knownDefault,
      hidden: (def.defaultHidden ?? []).filter((id) => registryIds.includes(id)),
      sizes: { ...(def.defaultSizes ?? {}) },
      preset: null,
    };
  }

  const savedOrder = saved.widget_order.filter((id) => registryIds.includes(id));
  const missing = knownDefault.filter(
    (id) => !savedOrder.includes(id) && !saved.hidden_widgets.includes(id),
  );
  return {
    order: [...savedOrder, ...missing],
    hidden: saved.hidden_widgets.filter((id) => registryIds.includes(id)),
    sizes: Object.fromEntries(
      Object.entries(saved.widget_sizes ?? {}).filter(([id]) => registryIds.includes(id)),
    ) as Record<string, WidgetSize>,
    preset: saved.preset ?? null,
  };
}

const localKey = (userId: string | undefined, dashboardKey: string) =>
  `cl_dashboard:${userId ?? "anon"}:${dashboardKey}`;

export function useDashboardPrefs(def: DashboardDefinition, registry: WidgetRegistry) {
  const { user } = useSession();
  const userId = user?.id;
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<State>(() => mergeWithDefaults(def, registry, null));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once on mount / user change.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Try localStorage first (fast paint) then Supabase.
      const local =
        typeof window !== "undefined"
          ? window.localStorage.getItem(localKey(userId, def.key))
          : null;
      if (local) {
        try {
          const parsed = JSON.parse(local) as DashboardPrefsRow;
          if (!cancelled) setState(mergeWithDefaults(def, registry, parsed));
        } catch {
          /* ignore */
        }
      }
      if (userId) {
        const { data } = await supabase
          .from("user_dashboard_prefs")
          .select("widget_order, hidden_widgets, widget_sizes, preset, layout_version")
          .eq("user_id", userId)
          .eq("dashboard_key", def.key)
          .maybeSingle();
        if (!cancelled) {
          setState(mergeWithDefaults(def, registry, data as DashboardPrefsRow | null));
        }
      }
      if (!cancelled) setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, def.key, def.layoutVersion]);

  const persist = useCallback(
    (next: State) => {
      // Local write (immediate)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          localKey(userId, def.key),
          JSON.stringify({
            widget_order: next.order,
            hidden_widgets: next.hidden,
            widget_sizes: next.sizes,
            preset: next.preset,
            layout_version: def.layoutVersion,
          }),
        );
      }
      // Supabase upsert (debounced)
      if (!userId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await supabase.from("user_dashboard_prefs").upsert(
          {
            user_id: userId,
            dashboard_key: def.key,
            widget_order: next.order,
            hidden_widgets: next.hidden,
            widget_sizes: next.sizes,
            preset: next.preset,
            layout_version: def.layoutVersion,
          },
          { onConflict: "user_id,dashboard_key" },
        );
      }, 500);
    },
    [userId, def.key, def.layoutVersion],
  );

  // Flush pending debounced save on unmount so we don't setState/upsert after teardown.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, []);

  const update = useCallback(
    (mutator: (s: State) => State) => {
      setState((prev) => {
        const next = mutator(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const api = useMemo(
    () => ({
      order: state.order,
      hidden: new Set(state.hidden),
      sizes: state.sizes,
      preset: state.preset,
      loaded,
      reorder: (nextOrder: string[]) => update((s) => ({ ...s, order: nextOrder })),
      hide: (id: string) =>
        update((s) => (s.hidden.includes(id) ? s : { ...s, hidden: [...s.hidden, id] })),
      restore: (id: string) => update((s) => ({ ...s, hidden: s.hidden.filter((x) => x !== id) })),
      setSize: (id: string, size: WidgetSize) =>
        update((s) => ({
          ...s,
          sizes: { ...s.sizes, [id]: size },
        })),
      applyPreset: (presetKey: string) => {
        const preset = def.presets?.find((p) => p.key === presetKey);
        if (!preset) return;
        update(() => ({
          order: preset.order.filter((id) => id in registry),
          hidden: (preset.hidden ?? []).filter((id) => id in registry),
          sizes: { ...(preset.sizes ?? {}) },
          preset: preset.key,
        }));
      },
      reset: () =>
        update(() => ({
          order: def.defaultOrder.filter((id) => id in registry),
          hidden: (def.defaultHidden ?? []).filter((id) => id in registry),
          sizes: { ...(def.defaultSizes ?? {}) },
          preset: null,
        })),
    }),
    [state, loaded, update, def, registry],
  );

  return api;
}

export type DashboardPrefsApi = ReturnType<typeof useDashboardPrefs>;
