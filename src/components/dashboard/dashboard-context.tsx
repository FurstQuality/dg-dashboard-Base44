import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { DashboardDefinition, DashboardMode, WidgetRegistry } from "./types";
import { useDashboardPrefs, type DashboardPrefsApi } from "./use-dashboard-prefs";

type Ctx = {
  def: DashboardDefinition;
  registry: WidgetRegistry;
  prefs: DashboardPrefsApi;
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
};

const DashboardCtx = createContext<Ctx | null>(null);

export function DashboardProvider({
  def,
  registry,
  children,
}: {
  def: DashboardDefinition;
  registry: WidgetRegistry;
  children: ReactNode;
}) {
  const prefs = useDashboardPrefs(def, registry);
  const [mode, setMode] = useState<DashboardMode>("view");
  const value = useMemo(
    () => ({ def, registry, prefs, mode, setMode }),
    [def, registry, prefs, mode],
  );
  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>;
}

export function useDashboard() {
  const v = useContext(DashboardCtx);
  if (!v) throw new Error("useDashboard must be used inside a DashboardProvider");
  return v;
}
