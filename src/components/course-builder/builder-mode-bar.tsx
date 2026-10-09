import { Map as MapIcon, Flag, TriangleAlert, PenLine } from "lucide-react";
import type { BuilderMode } from "@/lib/course-builder/layers";
import { Button } from "@/components/ui/button";

const MODES: { id: BuilderMode; label: string; icon: typeof MapIcon; hint: string }[] = [
  { id: "course", label: "Course", icon: MapIcon, hint: "Boundary, parking, paths and amenities" },
  { id: "holes", label: "Holes", icon: Flag, hint: "Tees, baskets, flight paths and rules" },
];

export function BuilderModeBar({ mode, onChange }: { mode: BuilderMode; onChange: (m: BuilderMode) => void }) {
  return (
    <div role="tablist" aria-label="Editing mode" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={m.hint}
            onClick={() => onChange(m.id)}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition " +
              (active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="h-4 w-4" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export type SetupStep = { id: string; label: string; done: boolean };

/** Guided setup: boundary first, then infrastructure, holes, routing, review, publish. */
export function GuidedSetupCard({
  steps,
  hasBoundary,
  acres,
  drawing,
  onDrawBoundary,
  onGoHoles,
}: {
  steps: SetupStep[];
  hasBoundary: boolean;
  acres: number;
  drawing: boolean;
  onDrawBoundary: () => void;
  onGoHoles: () => void;
}) {
  const current = steps.find((s) => !s.done) ?? steps[steps.length - 1];
  return (
    <div className="w-[min(92vw,340px)] rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
      <ol className="mb-2 flex flex-wrap gap-1 text-xs">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={
              "rounded-full border px-2 py-0.5 " +
              (s.id === current.id
                ? "border-primary bg-primary/10 text-primary"
                : s.done
                  ? "border-border text-foreground"
                  : "border-border text-muted-foreground")
            }
          >
            {i + 1}. {s.label}
            {s.done ? " ✓" : ""}
          </li>
        ))}
      </ol>
      {!hasBoundary ? (
        <>
          <p className="text-sm font-semibold">Start by drawing the course property.</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {drawing
              ? "Click around the edge of the course. Click the first point again to finish."
              : "It frames the map and helps catch tees or baskets placed outside the course. An approximate outline is fine."}
          </p>
          {!drawing ? (
            <Button size="sm" className="mt-2" onClick={onDrawBoundary}>
              <PenLine className="mr-1 h-4 w-4" /> Draw course boundary
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold">Boundary drawn · about {acres.toFixed(1)} acres</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Next: {current.label.toLowerCase()}. Add parking, restrooms and paths here, or move on to holes.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onGoHoles}>
            <Flag className="mr-1 h-4 w-4" /> Go to holes
          </Button>
        </>
      )}
    </div>
  );
}
