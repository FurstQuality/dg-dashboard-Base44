/**
 * Arrangeable page sections.
 *
 * Wraps a page's existing sections in a drag-and-drop grid so a player can
 * reorder them and hide the ones they don't use. Order is stored per user in
 * `user_dashboard_prefs` (same table the Home dashboard uses) with a
 * localStorage mirror for instant paint, so a layout follows them across devices.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

export type ArrangeableSection = {
  /** Stable id — never rename in place, it is the persisted key. */
  id: string;
  /** Human label shown in the arrange controls. */
  label: string;
  /** Grid span / layout classes for this section. */
  className?: string;
  /** Section cannot be hidden. */
  locked?: boolean;
  children: ReactNode;
};

type LayoutState = { order: string[]; hidden: string[] };

const localKey = (userId: string | undefined, pageKey: string) =>
  `dgd_sections:${userId ?? "anon"}:${pageKey}`;

function merge(ids: string[], saved: LayoutState | null): LayoutState {
  if (!saved) return { order: ids, hidden: [] };
  const known = saved.order.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !known.includes(id));
  return {
    order: [...known, ...missing],
    hidden: saved.hidden.filter((id) => ids.includes(id)),
  };
}

function useSectionLayout(pageKey: string, ids: string[]) {
  const { user } = useSession();
  const userId = user?.id;
  const idsKey = ids.join("|");
  const [state, setState] = useState<LayoutState>({ order: ids, hidden: [] });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const currentIds = idsKey.split("|");
    async function load() {
      if (typeof window !== "undefined") {
        const local = window.localStorage.getItem(localKey(userId, pageKey));
        if (local) {
          try {
            const parsed = JSON.parse(local) as LayoutState;
            if (!cancelled) setState(merge(currentIds, parsed));
          } catch {
            /* ignore malformed cache */
          }
        }
      }
      if (!userId) return;
      const { data } = await supabase
        .from("user_dashboard_prefs")
        .select("widget_order, hidden_widgets")
        .eq("user_id", userId)
        .eq("dashboard_key", `sections:${pageKey}`)
        .maybeSingle();
      if (cancelled || !data) return;
      setState(
        merge(currentIds, {
          order: (data.widget_order as string[]) ?? [],
          hidden: (data.hidden_widgets as string[]) ?? [],
        }),
      );
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, pageKey, idsKey]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const persist = useCallback(
    (next: LayoutState) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(localKey(userId, pageKey), JSON.stringify(next));
      }
      if (!userId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void supabase.from("user_dashboard_prefs").upsert(
          {
            user_id: userId,
            dashboard_key: `sections:${pageKey}`,
            widget_order: next.order,
            hidden_widgets: next.hidden,
            widget_sizes: {},
            preset: null,
            layout_version: 1,
          },
          { onConflict: "user_id,dashboard_key" },
        );
      }, 500);
    },
    [userId, pageKey],
  );

  const update = useCallback(
    (mutator: (s: LayoutState) => LayoutState) => {
      setState((prev) => {
        const next = mutator(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return {
    order: state.order,
    hidden: state.hidden,
    customized: state.order.join("|") !== idsKey || state.hidden.length > 0,
    reorder: (order: string[]) => update((s) => ({ ...s, order })),
    toggleHidden: (id: string) =>
      update((s) => ({
        ...s,
        hidden: s.hidden.includes(id) ? s.hidden.filter((x) => x !== id) : [...s.hidden, id],
      })),
    reset: () => update(() => ({ order: idsKey.split("|"), hidden: [] })),
  };
}

function SortableSection({
  section,
  arranging,
  hidden,
  onToggleHidden,
}: {
  section: ArrangeableSection;
  arranging: boolean;
  hidden: boolean;
  onToggleHidden: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: !arranging,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative flex min-w-0 flex-col",
        section.className,
        isDragging && "z-20 opacity-90",
        arranging && "gap-2 rounded-card ring-1 ring-primary/40",
        arranging && hidden && "opacity-50",
      )}
    >
      {arranging ? (
        <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-muted/40 px-2 py-1">
          <span className="truncate text-xs font-medium text-muted-foreground">{section.label}</span>
          <div className="flex items-center gap-1">
            {!section.locked ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={hidden ? `Show ${section.label}` : `Hide ${section.label}`}
                title={hidden ? `Show ${section.label}` : `Hide ${section.label}`}
                onClick={onToggleHidden}
              >
                {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
            <button
              type="button"
              className="flex h-7 cursor-grab items-center gap-1 rounded-control px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:cursor-grabbing"
              aria-label={`Move ${section.label}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
              Move
            </button>
          </div>
        </div>
      ) : null}
      <div className={cn("min-w-0 flex-1", arranging && "pointer-events-none select-none")}>
        {section.children}
      </div>
    </div>
  );
}


export function ArrangeableSections({
  pageKey,
  sections,
  className,
  controlsLabel = "Arrange layout",
}: {
  /** Stable per-page key for saved layouts. */
  pageKey: string;
  sections: ArrangeableSection[];
  /** Grid/stack classes for the container. */
  className?: string;
  controlsLabel?: string;
}) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const layout = useSectionLayout(pageKey, ids);
  const [arranging, setArranging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const ordered = layout.order.map((id) => byId.get(id)).filter(Boolean) as ArrangeableSection[];
  const visible = arranging ? ordered : ordered.filter((s) => !layout.hidden.includes(s.id));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = layout.order.indexOf(String(active.id));
    const to = layout.order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...layout.order];
    next.splice(from, 1);
    next.splice(to, 0, String(active.id));
    layout.reorder(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {arranging && layout.customized ? (
          <Button type="button" size="sm" variant="ghost" onClick={layout.reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset layout
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={arranging ? "default" : "outline"}
          onClick={() => setArranging((v) => !v)}
        >
          {arranging ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Done arranging
            </>
          ) : (
            <>
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> {controlsLabel}
            </>
          )}
        </Button>
      </div>

      {arranging ? (
        <p className="text-right text-xs text-muted-foreground">
          Drag the Move handle to reorder. Use the eye to hide a section you don't need.
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className={className}>
            {visible.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                arranging={arranging}
                hidden={layout.hidden.includes(section.id)}
                onToggleHidden={() => layout.toggleHidden(section.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
