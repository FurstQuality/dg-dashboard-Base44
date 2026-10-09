import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardProvider, useDashboard } from "./dashboard-context";
import { DashboardToolbar } from "./dashboard-toolbar";
import { DashboardWidget } from "./dashboard-widget";
import type { DashboardDefinition, UserAccess, WidgetRegistry } from "./types";
import { useUserAccess } from "@/lib/user-access";
import { MascotEmptyState } from "@/components/shell";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

function AccessGate({
  def,
  access,
  children,
}: {
  def: DashboardDefinition;
  access: UserAccess;
  children: ReactNode;
}) {
  if (def.requiresAccess && !def.requiresAccess(access)) {
    const denied = def.accessDenied;
    return (
      <MascotEmptyState
        intent="analytics"
        title={denied?.title ?? "Not available yet"}
        description={
          denied?.description ?? "You'll unlock this dashboard once you have the right access."
        }
        actions={
          denied?.actionHref ? (
            <Button asChild size="sm">
              <Link to={denied.actionHref}>{denied.actionLabel ?? "Learn more"}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return <>{children}</>;
}

function DashboardGrid({ header }: { header?: ReactNode }) {
  const { registry, prefs, mode } = useDashboard();
  const access = useUserAccess();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleIds = useMemo(
    () =>
      prefs.order.filter((id) => {
        if (prefs.hidden.has(id)) return false;
        const w = registry[id];
        if (!w) return false;
        if (w.requiresAccess && !w.requiresAccess(access)) return false;
        return true;
      }),
    [prefs.order, prefs.hidden, registry, access],
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = prefs.order.indexOf(String(active.id));
    const newIdx = prefs.order.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const next = [...prefs.order];
    next.splice(oldIdx, 1);
    next.splice(newIdx, 0, String(active.id));
    prefs.reorder(next);
  };

  return (
    <div className="space-y-4">
      {header}
      <DashboardToolbar />
      {!prefs.loaded ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="col-span-1 h-40 rounded-2xl md:col-span-3 xl:col-span-4" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
              {visibleIds.map((id) => {
                const widget = registry[id];
                if (!widget) return null;
                return <DashboardWidget key={id} widget={widget} />;
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {mode === "customize" && visibleIds.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          All widgets are hidden. Use Restore to bring some back or apply a preset.
        </div>
      )}
    </div>
  );
}

export function DashboardShell({
  def,
  registry,
  header,
}: {
  def: DashboardDefinition;
  registry: WidgetRegistry;
  header?: ReactNode;
}) {
  const access = useUserAccess();
  return (
    <AccessGate def={def} access={access}>
      <DashboardProvider def={def} registry={registry}>
        <DashboardGrid header={header} />
      </DashboardProvider>
    </AccessGate>
  );
}
