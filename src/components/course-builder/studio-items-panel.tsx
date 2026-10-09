import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type StudioItem = {
  id: string;
  label: string;
  kind: string;
  role?: string;
  detail: string;
  hole?: number;
  color?: string;
  placed: boolean;
};

/** One searchable inventory and one editor for the selected course object. */
export function StudioItemsPanel({
  items,
  selectedId,
  selectionSerial,
  activeHole,
  onSelect,
  onClear,
  onFind,
  editor,
  addTools,
  colors,
  fairwayActive,
  scope,
  onScopeChange,
}: {
  items: StudioItem[];
  selectedId: string | null;
  selectionSerial: number;
  activeHole: number;
  onSelect: (item: StudioItem) => void;
  onClear: () => void;
  onFind: (item: StudioItem) => void;
  editor: ReactNode;
  addTools: ReactNode;
  colors: ReactNode;
  fairwayActive: boolean;
  scope: "course" | "hole";
  onScopeChange: (scope: "course" | "hole") => void;
}) {
  const [tab, setTab] = useState("items"),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (selectedId) {
      setTab("items");
      setCollapsed(false);
    }
  }, [selectedId]);
  useEffect(() => {
    if (selectionSerial) { setTab("items");setCollapsed(false); }
  }, [selectionSerial]);
  const selected = items.find((item) => item.id === selectedId);
  const visible = items.filter(
    (item) =>
      (scope === "course" || item.hole === activeHole) &&
      `${item.label} ${item.kind} ${item.role ?? ""} ${item.detail}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section
      aria-label="Course items"
      className={
        (fairwayActive ? "hidden md:block " : "") +
        (collapsed ? "absolute left-14 top-16 z-[700] rounded-lg border bg-background/95 px-2 py-1 shadow " : "absolute bottom-20 left-2 right-2 z-[700] max-h-[55%] overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur md:bottom-auto md:right-auto md:top-16 md:max-h-[calc(100%-9rem)] md:w-80")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">Course items</strong>
        <Button
          size="sm"
          variant="ghost"
          aria-label={collapsed ? "Expand course items" : "Collapse course items"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "Open" : "−"}
        </Button>
      </div>
      <div hidden={collapsed}>
          <div className="my-2 grid grid-cols-3 gap-1" role="tablist" aria-label="Course tools">
            {[
              ["items", "Items"],
              ["add", "Add"],
              ["colors", "Colors"],
            ].map(([id, label]) => (
              <Button
                key={id}
                role="tab"
                aria-selected={tab === id && !fairwayActive}
                variant={tab === id && !fairwayActive ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  onClear();
                  setTab(id);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          {!fairwayActive && (
            <>
              <div hidden={tab !== "items"}>
                {selected ? (
                  <div className="space-y-3" data-testid="selected-item-editor">
                    <Button size="sm" variant="ghost" onClick={onClear}>
                      ← All items
                    </Button>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <strong className="text-sm">
                          {selected.role ?? selected.kind} · {selected.label}
                        </strong>
                        <p className="text-xs text-muted-foreground">{selected.detail}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => onFind(selected)}>
                        {selected.placed ? "Locate" : "Place"}
                      </Button>
                    </div>
                    {editor}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Click an item on the map or choose it below. Drag to move.
                    </p>
                    <Input
                      aria-label="Search course items"
                      placeholder="Search tees, baskets, trees, OB…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                      aria-label="Item scope"
                      className="w-full rounded-md border bg-background p-2 text-xs"
                      value={scope}
                      onChange={(e) => onScopeChange(e.target.value as "course" | "hole")}
                    >
                      <option value="hole">Hole {activeHole} only</option>
                      <option value="course">Whole course</option>
                    </select>
                    <p className="text-xs text-muted-foreground">{visible.length} items</p>
                    {visible.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Edit ${item.kind} ${item.label} ${item.detail}`}
                        onClick={() => onSelect(item)}
                        className="flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left hover:bg-muted"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border"
                          style={{ background: item.color ?? "#64748b" }}
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-xs">
                            {item.role ?? item.kind} · {item.label}
                          </strong>
                          <span className="block text-[11px] text-muted-foreground">
                            {item.detail}
                            {item.placed ? "" : " · awaiting placement"}
                          </span>
                        </span>
                      </button>
                    ))}
                    {!visible.length && (
                      <p className="text-xs">No matching items. Use Add to place something new.</p>
                    )}
                  </div>
                )}
              </div>
              <div hidden={tab !== "add"} className="space-y-3">
                {addTools}
              </div>
            </>
          )}
          {/* Keep color inheritance mounted while browsing or selecting objects. */}
          <div hidden={tab !== "colors" || fairwayActive}>{colors}</div>
      </div>
    </section>
  );
}
