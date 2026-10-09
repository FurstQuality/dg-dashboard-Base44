import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Responsive, WidthProvider, type LayoutItem } from "react-grid-layout/legacy";
type LayoutArr = LayoutItem[];
type Layouts = { [breakpoint: string]: LayoutItem[] };
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EyeOff, GripVertical, LayoutGrid, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const RGL = WidthProvider(Responsive);

export type DashboardWidget = {
  id: string;
  title: string;
  render: () => ReactNode;
  /** Grid cells (12-col grid). x/y in cells, w in cells, h in row-units. */
  defaultLayout: { x: number; y: number; w: number; h: number };
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  /** When true, widget chrome (header, border) is suppressed — render() provides its own. */
  bare?: boolean;
  /** When true, this widget cannot be hidden (still movable/resizable). */
  required?: boolean;
};

type Props = {
  pageId: string; // e.g. "home", "stats", "profile"
  widgets: DashboardWidget[];
  /** Static content rendered below the grid (e.g. the endless feed). */
  children?: ReactNode;
  className?: string;
};

type StoredEnvelope = { v: 3; items: LayoutArr; hidden: string[] };

const STORAGE_PREFIX = "cl_layout_v3:";
const UNDO_LIMIT = 40;
const ROW_HEIGHT = 56;
const COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 900, sm: 600, xs: 400, xxs: 0 };

function toLayout(widgets: DashboardWidget[]): LayoutArr {
  return widgets.map((w) => ({
    i: w.id,
    x: w.defaultLayout.x,
    y: w.defaultLayout.y,
    w: w.defaultLayout.w,
    h: w.defaultLayout.h,
    minW: w.minW ?? 2,
    minH: w.minH ?? 2,
    maxW: w.maxW,
    maxH: w.maxH,
  }));
}

function normalizeStored(raw: unknown): { items: LayoutArr; hidden: string[] } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return { items: raw as LayoutArr, hidden: [] };
  if (typeof raw === "object" && raw !== null && "items" in raw) {
    const env = raw as Partial<StoredEnvelope>;
    return {
      items: Array.isArray(env.items) ? (env.items as LayoutArr) : [],
      hidden: Array.isArray(env.hidden) ? (env.hidden as string[]) : [],
    };
  }
  return null;
}

function readLocal(pageId: string): { items: LayoutArr; hidden: string[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + pageId);
    if (!raw) return null;
    return normalizeStored(JSON.parse(raw));
  } catch {
    return null;
  }
}
function writeLocal(pageId: string, items: LayoutArr, hidden: string[]) {
  try {
    const env: StoredEnvelope = { v: 3, items, hidden };
    window.localStorage.setItem(STORAGE_PREFIX + pageId, JSON.stringify(env));
  } catch {
    // Storage unavailable (private mode or quota) — layout stays in memory.
  }
}

/** Merge saved layout with widget defaults so new widgets appear and removed ones drop. */
function mergeLayout(defaults: LayoutArr, saved: LayoutArr | null): LayoutArr {
  if (!saved) return defaults;
  const savedById = new Map(saved.map((l) => [l.i, l]));
  return defaults.map((d) => {
    const s = savedById.get(d.i);
    return s ? { ...d, x: s.x, y: s.y, w: s.w, h: s.h } : d;
  });
}

function layoutsEqual(a: LayoutArr, b: LayoutArr): boolean {
  if (a.length !== b.length) return false;
  const bm = new Map(b.map((l) => [l.i, l]));
  for (const l of a) {
    const o = bm.get(l.i);
    if (!o || o.x !== l.x || o.y !== l.y || o.w !== l.w || o.h !== l.h) return false;
  }
  return true;
}

export function DashboardGrid({ pageId, widgets, children, className }: Props) {
  const defaults = useMemo(() => toLayout(widgets), [widgets]);
  const [layout, setLayout] = useState<LayoutArr>(defaults);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const initialized = useRef(false);
  const undoStack = useRef<Array<{ items: LayoutArr; hidden: string[] }>>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoCount, setUndoCount] = useState(0);

  const widgetById = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const validIds = useMemo(() => new Set(widgets.map((w) => w.id)), [widgets]);

  // Hydrate: local first, then Supabase override
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const local = readLocal(pageId);
    if (local) {
      setLayout(mergeLayout(defaults, local.items));
      setHidden(local.hidden.filter((id) => validIds.has(id)));
    }
    setHydrated(true);
    (async () => {
      const { data: sess } = await supabase.auth.getUser();
      if (!sess.user) return;
      const { data } = await supabase
        .from("user_dashboard_layouts")
        .select("layout")
        .eq("user_id", sess.user.id)
        .eq("page", pageId)
        .maybeSingle();
      const remote = normalizeStored(data?.layout);
      if (remote) {
        const mergedItems = mergeLayout(defaults, remote.items);
        const mergedHidden = remote.hidden.filter((id) => validIds.has(id));
        setLayout(mergedItems);
        setHidden(mergedHidden);
        writeLocal(pageId, mergedItems, mergedHidden);
      }
    })().catch(() => {
      // Aborted on navigation — the local layout already rendered.
    });
  }, [pageId, defaults, validIds]);

  // Only include visible widgets in the RGL layout
  const visibleLayout: LayoutArr = useMemo(
    () => layout.filter((l) => !hidden.includes(l.i)),
    [layout, hidden],
  );

  const layouts: Layouts = useMemo(
    () => ({
      lg: visibleLayout,
      md: visibleLayout,
      sm: visibleLayout,
      xs: visibleLayout,
      xxs: visibleLayout,
    }),
    [visibleLayout],
  );

  const scheduleRemoteSave = useCallback(
    (items: LayoutArr, hid: string[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const { data: sess } = await supabase.auth.getUser();
        if (!sess.user) return;
        const env: StoredEnvelope = { v: 3, items, hidden: hid };
        await supabase.from("user_dashboard_layouts").upsert({
          user_id: sess.user.id,
          page: pageId,
          layout: env as unknown as any,
        });
      }, 700);
    },
    [pageId],
  );

  const commit = useCallback(
    (nextLayout: LayoutArr, nextHidden: string[], pushUndo: boolean) => {
      setLayout((prevLayout) => {
        setHidden((prevHidden) => {
          const layoutSame = layoutsEqual(prevLayout, nextLayout);
          const hiddenSame =
            prevHidden.length === nextHidden.length &&
            prevHidden.every((h) => nextHidden.includes(h));
          if (layoutSame && hiddenSame) return prevHidden;
          if (pushUndo) {
            undoStack.current.push({ items: prevLayout, hidden: prevHidden });
            if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
            setUndoCount(undoStack.current.length);
          }
          writeLocal(pageId, nextLayout, nextHidden);
          scheduleRemoteSave(nextLayout, nextHidden);
          return nextHidden;
        });
        return layoutsEqual(prevLayout, nextLayout) ? prevLayout : nextLayout;
      });
    },
    [pageId, scheduleRemoteSave],
  );

  function onLayoutChange(current: ReadonlyArray<LayoutItem>) {
    if (!hydrated || !editing) return;
    // Merge visible changes back into the full layout array (preserve hidden entries)
    const currentById = new Map(current.map((l) => [l.i, l]));
    const merged: LayoutArr = layout.map((l) => {
      const c = currentById.get(l.i);
      return c ? { ...l, x: c.x, y: c.y, w: c.w, h: c.h } : l;
    });
    commit(merged, hidden, true);
  }

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setUndoCount(undoStack.current.length);
    commit(prev.items, prev.hidden, false);
  }

  function resetLayout() {
    undoStack.current.push({ items: layout, hidden });
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
    commit(defaults, [], false);
    toast.success("Layout reset to default");
  }

  function hideWidget(id: string) {
    const w = widgetById.get(id);
    if (w?.required) {
      toast.error("This widget is required and can't be hidden");
      return;
    }
    if (hidden.includes(id)) return;
    commit(layout, [...hidden, id], true);
  }

  function showWidget(id: string) {
    if (!hidden.includes(id)) return;
    commit(
      layout,
      hidden.filter((h) => h !== id),
      true,
    );
  }

  function exitEditor() {
    setEditing(false);
    undoStack.current = [];
    setUndoCount(0);
  }

  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setSlot(document.getElementById("dashboard-toolbar-slot"));
    find();
    const t = window.setTimeout(find, 0);
    return () => window.clearTimeout(t);
  }, []);

  const hiddenWidgets = widgets.filter((w) => hidden.includes(w.id));

  const toolbar = (
    <div
      className={
        slot
          ? "flex flex-wrap items-center gap-2"
          : "sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border-2 border-primary/40 bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
      }
    >
      {!editing ? (
        <>
          <Button
            size="sm"
            variant="default"
            onClick={() => setEditing(true)}
            className="gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            title="Rearrange, resize, or hide widgets"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Edit layout</span>
          </Button>
          {hiddenWidgets.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5" title="Show hidden widgets">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add widget ({hiddenWidgets.length})</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Hidden widgets</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hiddenWidgets.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => showWidget(w.id)}>
                    <Plus className="mr-2 h-3.5 w-3.5" /> {w.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      ) : (
        <>
          <span className="hidden rounded-md bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary sm:inline">
            Editing — auto-saves
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5" title="Add or hide widgets">
                <Plus className="h-4 w-4" />
                <span className="hidden md:inline">Widgets</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Widgets</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {widgets.map((w) => {
                const isHidden = hidden.includes(w.id);
                return (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => (isHidden ? showWidget(w.id) : hideWidget(w.id))}
                    disabled={!isHidden && w.required}
                  >
                    {isHidden ? (
                      <Plus className="mr-2 h-3.5 w-3.5 text-primary" />
                    ) : (
                      <EyeOff className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="flex-1">{w.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {isHidden ? "Show" : w.required ? "Required" : "Hide"}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            onClick={undo}
            disabled={undoCount === 0}
            className="gap-1.5"
            title="Undo last change"
          >
            <Undo2 className="h-4 w-4" />
            <span className="hidden md:inline">Undo{undoCount > 0 ? ` (${undoCount})` : ""}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={resetLayout}
            className="gap-1.5"
            title="Restore default layout"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden md:inline">Reset</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={exitEditor}
            className="gap-1.5"
            title="Exit editor"
          >
            <X className="h-4 w-4" />
            <span className="hidden md:inline">Done</span>
          </Button>
        </>
      )}
    </div>
  );

  const visibleWidgets = widgets.filter((w) => !hidden.includes(w.id));

  return (
    <div className={className}>
      {slot ? createPortal(toolbar, slot) : toolbar}

      <RGL
        className={editing ? "layout is-editing" : "layout"}
        layouts={layouts}
        cols={COLS}
        breakpoints={BREAKPOINTS}
        rowHeight={ROW_HEIGHT}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        isDraggable={editing}
        isResizable={editing}
        draggableHandle=".dashboard-drag-handle"
        resizeHandles={["se", "sw", "ne", "nw"]}
        onLayoutChange={onLayoutChange}
        compactType="vertical"
        useCSSTransforms
      >
        {visibleWidgets.map((w) => (
          <div key={w.id} className="group">
            {w.bare ? (
              <div className="relative h-full">
                {editing ? (
                  <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-primary/40" />
                ) : null}
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="dashboard-drag-handle absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-md border border-border/60 bg-card/95 text-muted-foreground shadow hover:text-primary"
                      aria-label="Drag widget"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    {!w.required ? (
                      <button
                        type="button"
                        onClick={() => hideWidget(w.id)}
                        className="absolute right-10 top-2 z-20 grid h-7 w-7 place-items-center rounded-md border border-border/60 bg-card/95 text-muted-foreground shadow hover:text-destructive"
                        aria-label="Hide widget"
                        title="Hide widget"
                      >
                        <EyeOff className="h-4 w-4" />
                      </button>
                    ) : null}
                  </>
                ) : null}
                <div className="h-full overflow-auto">{w.render()}</div>
              </div>
            ) : (
              <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_4px_0_0_rgba(0,0,0,0.35)]">
                {editing ? (
                  <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-primary/40" />
                ) : null}
                <div className="flex items-center gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 to-secondary/10 px-3 py-2">
                  {editing ? (
                    <button
                      type="button"
                      className="dashboard-drag-handle cursor-move rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Drag widget"
                      title="Drag to move"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  ) : null}
                  <h3 className="min-w-0 flex-1 truncate font-graphic text-base tracking-wide text-primary">
                    {w.title}
                  </h3>
                  {editing && !w.required ? (
                    <button
                      type="button"
                      onClick={() => hideWidget(w.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Hide widget"
                      title="Hide widget"
                    >
                      <EyeOff className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-3">{w.render()}</div>
              </div>
            )}
          </div>
        ))}
      </RGL>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
