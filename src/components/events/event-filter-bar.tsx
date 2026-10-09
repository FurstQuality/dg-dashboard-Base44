/**
 * Shared filter surface for the events browser and tracker event list.
 * Controlled component — parent owns filter state.
 */
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EventFilters = {
  q: string;
  tier: string; // "" = any
  division: string; // "" = any
  hasCrew: boolean;
  sort: "date" | "tier" | "name";
};

export const emptyFilters: EventFilters = {
  q: "",
  tier: "",
  division: "",
  hasCrew: false,
  sort: "date",
};

const COMMON_TIERS = ["A", "B", "C", "XA", "XB", "M", "ES", "DGPT", "Major"];

export function EventFilterBar({
  value,
  onChange,
  divisions,
  compact,
}: {
  value: EventFilters;
  onChange: (next: EventFilters) => void;
  divisions: string[];
  compact?: boolean;
}) {
  const set = (patch: Partial<EventFilters>) => onChange({ ...value, ...patch });
  const anyActive = value.q || value.tier || value.division || value.hasCrew;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search events, courses, city…"
          className="h-8 pl-7"
        />
      </div>
      <Select
        value={value.tier || "any"}
        onValueChange={(v) => set({ tier: v === "any" ? "" : v })}
      >
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue placeholder="Tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any tier</SelectItem>
          {COMMON_TIERS.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.division || "any"}
        onValueChange={(v) => set({ division: v === "any" ? "" : v })}
      >
        <SelectTrigger className="h-8 w-[130px]">
          <SelectValue placeholder="Division" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any division</SelectItem>
          {divisions.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.sort} onValueChange={(v) => set({ sort: v as EventFilters["sort"] })}>
        <SelectTrigger className="h-8 w-[110px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date">Sort: Date</SelectItem>
          <SelectItem value="tier">Sort: Tier</SelectItem>
          <SelectItem value="name">Sort: Name</SelectItem>
        </SelectContent>
      </Select>
      <label className="inline-flex select-none items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs">
        <input
          type="checkbox"
          checked={value.hasCrew}
          onChange={(e) => set({ hasCrew: e.target.checked })}
        />
        Crew only
      </label>
      {anyActive && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={() => onChange({ ...emptyFilters, sort: value.sort })}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
