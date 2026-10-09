import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, RotateCcw, Settings2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CustomizableSection = {
  /** Stable key stored in the saved layout — never change it for an existing section. */
  id: string;
  /** Name shown in the customize menu. */
  title: string;
  node: ReactNode;
  /** Required sections can be reordered but not hidden. */
  required?: boolean;
};

type Stored = { v: 1; order: string[]; hidden: string[] };

const STORAGE_PREFIX = "dgd_sections_v1:";

function readLocal(pageId: string): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + pageId);
    return raw ? (normalize(JSON.parse(raw)) ?? null) : null;
  } catch {
    return null;
  }
}

function normalize(raw: unknown): Stored | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Stored>;
  if (!Array.isArray(r.order) && !Array.isArray(r.hidden)) return null;
  return {
    v: 1,
    order: Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === "string") : [],
    hidden: Array.isArray(r.hidden) ? r.hidden.filter((x): x is string => typeof x === "string") : [],
  };
}

/** Saved order first (unknown ids dropped), then any new sections in code order. */
function applyOrder(ids: string[], savedOrder: string[]): string[] {
  const known = new Set(ids);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of savedOrder) {
    if (known.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of ids) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * Stacked page sections the player can reorder and hide, saved to their account
 * and mirrored to this device so the layout is there on the next visit.
 */
export function CustomizableSections({
  pageId,
  sections,
  className,
  label = "Customize",
}: {
  pageId: string;
  sections: CustomizableSection[];
  className?: string;
  label?: string;
}) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const byId = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const [order, setOrder] = useState<string[]>(ids);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrder((prev) => applyOrder(ids, prev));
    setHidden((prev) => prev.filter((id) => ids.includes(id)));
  }, [ids]);

  // Hydrate: this device first so the layout paints immediately, account after.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const local = readLocal(pageId);
    if (local) {
      setOrder(applyOrder(ids, local.order));
      setHidden(local.hidden.filter((id) => ids.includes(id)));
    }
    (async () => {
      const { data: sess } = await supabase.auth.getUser();
      if (!sess.user) return;
      const { data } = await supabase
        .from("user_dashboard_layouts")
        .select("layout")
        .eq("user_id", sess.user.id)
        .eq("page", `sections:${pageId}`)
        .maybeSingle();
      const remote = normalize(data?.layout);
      if (remote) {
        setOrder(applyOrder(ids, remote.order));
        setHidden(remote.hidden.filter((id) => ids.includes(id)));
      }
    })().catch(() => {
      // Offline or navigated away — the device copy is already showing.
    });
  }, [pageId, ids]);

  const persist = useCallback(
    (nextOrder: string[], nextHidden: string[]) => {
      const env: Stored = { v: 1, order: nextOrder, hidden: nextHidden };
      try {
        window.localStorage.setItem(STORAGE_PREFIX + pageId, JSON.stringify(env));
      } catch {
        // Storage blocked — the layout still applies for this session.
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const { data: sess } = await supabase.auth.getUser();
        if (!sess.user) return;
        await supabase.from("user_dashboard_layouts").upsert({
          user_id: sess.user.id,
          page: `sections:${pageId}`,
          layout: env as unknown as never,
        });
      }, 600);
    },
    [pageId],
  );

  const commit = useCallback(
    (nextOrder: string[], nextHidden: string[]) => {
      setOrder(nextOrder);
      setHidden(nextHidden);
      persist(nextOrder, nextHidden);
    },
    [persist],
  );

  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    next[i] = next[j];
    next[j] = id;
    commit(next, hidden);
  };

  const toggle = (id: string) => {
    if (hidden.includes(id)) {
      commit(
        order,
        hidden.filter((h) => h !== id),
      );
      return;
    }
    if (byId.get(id)?.required) {
      toast.error("This section is always shown");
      return;
    }
    commit(order, [...hidden, id]);
  };

  const reset = () => {
    commit(ids, []);
    toast.success("Layout reset");
  };

  const visible = order.filter((id) => byId.has(id) && !hidden.includes(id));
  const hiddenCount = hidden.length;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <span className="mr-auto text-xs font-semibold text-primary">
              Reorder or hide sections — changes save as you go
            </span>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setEditing(false)}>
              <Check className="h-4 w-4" />
              Done
            </Button>
          </>
        ) : (
          <>
            {hiddenCount > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Eye className="h-4 w-4" />
                    Hidden ({hiddenCount})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Hidden sections</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hidden.map((id) => (
                    <DropdownMenuItem key={id} onClick={() => toggle(id)}>
                      <Eye className="mr-2 h-3.5 w-3.5" />
                      <span className="flex-1">{byId.get(id)?.title ?? id}</span>
                      <span className="text-[10px] text-muted-foreground">Show</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setEditing(true)}
              title="Reorder or hide sections on this view"
            >
              <Settings2 className="h-4 w-4" />
              {label}
            </Button>
          </>
        )}
      </div>

      <div className="mt-3 space-y-4">
        {visible.map((id, index) => {
          const s = byId.get(id)!;
          return (
            <div key={id} className="relative">
              {editing ? (
                <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{s.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => move(id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${s.title} up`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => move(id, 1)}
                    disabled={index === visible.length - 1}
                    aria-label={`Move ${s.title} down`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  {s.required ? (
                    <span className="text-[10px] text-muted-foreground">Always shown</span>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => toggle(id)}
                      aria-label={`Hide ${s.title}`}
                    >
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : null}
              {s.node}
            </div>
          );
        })}
      </div>

      {editing && hiddenCount > 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hidden
          </div>
          <div className="flex flex-wrap gap-2">
            {hidden.map((id) => (
              <Button key={id} size="sm" variant="outline" className="gap-1.5" onClick={() => toggle(id)}>
                <X className="h-3.5 w-3.5" />
                {byId.get(id)?.title ?? id}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
