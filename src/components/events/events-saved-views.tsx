import { useEffect, useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const KEY = "dgd:events:savedViews";

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  // Verbatim URL search snapshot (already normalized by the route).
  search: Record<string, unknown>;
}

function load(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        !!v &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        typeof v.search === "object",
    );
  } catch {
    return [];
  }
}

function persist(views: SavedView[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(views));
}

interface Props {
  currentSearch: Record<string, unknown>;
  onApply: (search: Record<string, unknown>) => void;
}

export function EventsSavedViews({ currentSearch, onApply }: Props) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setViews(load());
  }, []);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.info("Give the view a name first.");
      return;
    }
    const next: SavedView = {
      id: crypto.randomUUID(),
      name: trimmed.slice(0, 60),
      createdAt: new Date().toISOString(),
      search: currentSearch,
    };
    const updated = [next, ...views].slice(0, 20);
    setViews(updated);
    persist(updated);
    setName("");
    toast.success(`Saved view "${next.name}"`);
  }

  function remove(id: string) {
    const updated = views.filter((v) => v.id !== id);
    setViews(updated);
    persist(updated);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1">
          <Bookmark className="h-3.5 w-3.5" />
          Views
          {views.length > 0 ? (
            <span className="ml-1 text-xs text-muted-foreground">({views.length})</span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Saved views</h4>
          <p className="text-[11px] text-muted-foreground">
            Save the current filter combination for one-click access later.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My weekend Kansas events"
            className="h-8"
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <Button size="sm" className="h-8" onClick={save}>
            Save
          </Button>
        </div>

        <div className="max-h-[240px] space-y-1 overflow-y-auto">
          {views.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              No saved views yet. Save one to keep your favorite filters handy.
            </p>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                className="group flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-accent/40"
              >
                <button
                  type="button"
                  onClick={() => onApply(v.search)}
                  className="min-w-0 flex-1 truncate text-left text-sm hover:text-primary"
                  title={new Date(v.createdAt).toLocaleString()}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => remove(v.id)}
                  className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                  aria-label={`Delete ${v.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
