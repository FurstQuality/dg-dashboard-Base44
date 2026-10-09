import { KIND_META, SOURCE_META, type UnifiedRow } from "./events-types";

export type GroupBy = "none" | "month" | "source" | "tier" | "bucket" | "kind";

export const VALID_GROUP: Set<GroupBy> = new Set([
  "none",
  "month",
  "source",
  "tier",
  "bucket",
  "kind",
]);

export interface EventGroup {
  key: string;
  label: string;
  sublabel?: string;
  rows: UnifiedRow[];
}

function monthKey(iso: string | null): { key: string; label: string } {
  if (!iso) return { key: "zzz-tbd", label: "Date TBD" };
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (isNaN(d.getTime())) return { key: "zzz-tbd", label: "Date TBD" };
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return { key, label };
}

const BUCKET_LABEL: Record<string, string> = {
  sanctioned: "PDGA Sanctioned",
  unsanctioned: "Unsanctioned",
  casual: "Casual",
};

export function groupRows(rows: UnifiedRow[], by: GroupBy): EventGroup[] {
  if (by === "none") {
    return [{ key: "all", label: "", rows }];
  }
  const map = new Map<string, EventGroup>();
  for (const r of rows) {
    let key = "";
    let label = "";
    if (by === "month") {
      const mk = monthKey(r.start_date);
      key = mk.key;
      label = mk.label;
    } else if (by === "source") {
      key = r.source;
      label = SOURCE_META[r.source].label;
    } else if (by === "tier") {
      key = r.tier ?? "—";
      label = r.tier ? `Tier / Season · ${r.tier}` : "No tier";
    } else if (by === "bucket") {
      key = r.bucket;
      label = BUCKET_LABEL[r.bucket] ?? r.bucket;
    } else if (by === "kind") {
      key = r.kind;
      label = KIND_META[r.kind].label + "s";
    }
    let g = map.get(key);
    if (!g) {
      g = { key, label, rows: [] };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  const out = Array.from(map.values());
  // Sort groups sensibly: chronological for month, alpha for others.
  if (by === "month") {
    out.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    out.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }
  for (const g of out) g.sublabel = `${g.rows.length} event${g.rows.length === 1 ? "" : "s"}`;
  return out;
}
