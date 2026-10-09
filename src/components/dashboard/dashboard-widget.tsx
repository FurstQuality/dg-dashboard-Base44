import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripVertical, ChevronRight, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WidgetDefinition, WidgetSize } from "./types";
import { useDashboard } from "./dashboard-context";

const SIZE_LABELS: Record<WidgetSize, string> = { sm: "S", md: "M", lg: "L", full: "Full" };

// Tailwind col-span classes must be complete strings for JIT to pick them up.
const COL_SPAN: Record<WidgetSize, string> = {
  sm: "md:col-span-3 xl:col-span-3",
  md: "md:col-span-3 xl:col-span-4",
  lg: "md:col-span-6 xl:col-span-6",
  full: "md:col-span-6 xl:col-span-12",
};

export function DashboardWidget({ widget }: { widget: WidgetDefinition }) {
  const { prefs, mode } = useDashboard();
  const size = (prefs.sizes[widget.id] ?? widget.defaultSize) as WidgetSize;
  const supportedSizes = widget.supportedSizes ?? (["sm", "md", "lg", "full"] as WidgetSize[]);

  const sortable = useSortable({ id: widget.id, disabled: mode !== "customize" });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = widget.icon;
  const body = widget.render({ mode, size });

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        "col-span-1 flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-sm",
        COL_SPAN[size],
        mode === "customize" && "ring-1 ring-primary/30",
        isDragging && "z-10 opacity-70 shadow-lg",
      )}
      aria-label={widget.title}
    >
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        {mode === "customize" ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={`Drag ${widget.title}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : Icon ? (
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{widget.title}</h3>
          {widget.subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{widget.subtitle}</p>
          ) : null}
        </div>
        {mode === "customize" ? (
          <div className="flex items-center gap-1">
            {supportedSizes.length > 1 && (
              <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                {supportedSizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => prefs.setSize(widget.id, s)}
                    className={cn(
                      "px-1.5 py-0.5 text-[10px] font-semibold rounded",
                      s === size
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label={`Set ${widget.title} to ${SIZE_LABELS[s]} size`}
                  >
                    {SIZE_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
            {widget.locked ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                title="Required widget"
              >
                <Lock className="h-3 w-3" /> Required
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => prefs.hide(widget.id)}
              >
                <EyeOff className="mr-1 h-3.5 w-3.5" /> Hide
              </Button>
            )}
          </div>
        ) : (
          widget.href && (
            <Link
              to={widget.href}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Open <ChevronRight className="h-3 w-3" />
            </Link>
          )
        )}
      </header>
      <div className="min-h-0 flex-1 p-4">{body}</div>
    </section>
  );
}
