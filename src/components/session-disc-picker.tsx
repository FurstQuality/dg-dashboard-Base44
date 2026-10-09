// Multi-disc selector with per-disc quantity — used by the driving range
// and putting green to record what a player brought to a session.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Minus, Trash2, Backpack, Search } from "lucide-react";

export type BagDiscOption = {
  id: string;
  nickname: string | null;
  color?: string | null;
  mold: {
    id: string;
    name: string;
    speed: number | null;
    glide: number | null;
    turn: number | null;
    fade: number | null;
    category?: string | null;
    manufacturer?: { name: string } | null;
  } | null;
};

export type SessionDisc = {
  disc_id: string;
  quantity: number;
  label: string;
  color?: string | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  category?: string | null;
};

export function toSessionDisc(b: BagDiscOption, quantity = 1): SessionDisc {
  return {
    disc_id: b.id,
    quantity,
    label: b.nickname || b.mold?.name || "Disc",
    color: b.color ?? null,
    speed: b.mold?.speed ?? null,
    glide: b.mold?.glide ?? null,
    turn: b.mold?.turn ?? null,
    fade: b.mold?.fade ?? null,
    category: b.mold?.category ?? null,
  };
}

export function categoryFilter(cat: string | null | undefined, mode: "range" | "putting"): boolean {
  if (mode === "putting") return cat === "putter" || cat == null;
  return true;
}

export function SessionDiscPicker({
  bag,
  value,
  onChange,
  mode = "range",
  title,
}: {
  bag: BagDiscOption[];
  value: SessionDisc[];
  onChange: (next: SessionDisc[]) => void;
  mode?: "range" | "putting";
  title?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bag
      .filter((b) => categoryFilter(b.mold?.category, mode))
      .filter((b) => {
        if (!q) return true;
        const hay =
          `${b.nickname ?? ""} ${b.mold?.name ?? ""} ${b.mold?.manufacturer?.name ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [bag, query, mode]);

  const byId = new Map(value.map((v) => [v.disc_id, v]));
  const totalDiscs = value.reduce((n, d) => n + d.quantity, 0);

  function set(disc: BagDiscOption, quantity: number) {
    const existing = byId.get(disc.id);
    const next = value.filter((v) => v.disc_id !== disc.id);
    if (quantity > 0) {
      next.push(existing ? { ...existing, quantity } : toSessionDisc(disc, quantity));
    }
    onChange(next);
  }

  function inc(disc: BagDiscOption) {
    const q = (byId.get(disc.id)?.quantity ?? 0) + 1;
    set(disc, Math.min(q, 9));
  }
  function dec(disc: BagDiscOption) {
    const q = (byId.get(disc.id)?.quantity ?? 0) - 1;
    set(disc, Math.max(q, 0));
  }
  function clearAll() {
    onChange([]);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Backpack className="h-4 w-4" /> {title ?? "Discs for this session"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {value.length} molds · {totalDiscs} discs
            </Badge>
            {value.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <Trash2 className="mr-1 h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </div>
        <div className="relative pt-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7"
            placeholder={
              mode === "putting"
                ? "Search putters (Zone, Luna, Judge…)"
                : "Search bag (mold, brand, nickname)"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {bag.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Your bag is empty. Add discs in <span className="font-medium">My Bag</span> so this
            session can track them.
          </p>
        )}
        {bag.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing in your bag matches "{query}".</p>
        )}
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {filtered.map((b) => {
            const chosen = byId.get(b.id);
            const qty = chosen?.quantity ?? 0;
            const label = b.nickname || b.mold?.name || "Disc";
            const stats =
              b.mold && b.mold.speed != null
                ? `S${b.mold.speed} · G${b.mold.glide ?? "?"} · T${b.mold.turn ?? "?"} · F${b.mold.fade ?? "?"}`
                : (b.mold?.manufacturer?.name ?? "");
            return (
              <div
                key={b.id}
                className={`flex items-center gap-3 rounded-md border p-2 text-sm ${qty > 0 ? "border-primary/50 bg-primary/5" : ""}`}
              >
                <span
                  className="h-6 w-6 shrink-0 rounded-full border"
                  style={{ background: b.color ?? "#64748b" }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {b.mold?.name && label !== b.mold.name ? `${b.mold.name}` : ""}
                    {b.mold?.manufacturer?.name ? ` · ${b.mold.manufacturer.name}` : ""}
                    {stats ? ` · ${stats}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Decrease count"
                    className="h-7 w-7"
                    onClick={() => dec(b)}
                    disabled={qty === 0}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Increase count"
                    className="h-7 w-7"
                    onClick={() => inc(b)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
