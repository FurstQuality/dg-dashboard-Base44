import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AdvancedFilterValues {
  from: string;
  to: string;
  loc: string;
  state: string;
  cover: boolean;
  crew: boolean;
  mind: number;
}

interface Props {
  values: AdvancedFilterValues;
  states: string[];
  onChange: (patch: Partial<AdvancedFilterValues>) => void;
  onReset: () => void;
  activeCount: number;
}

export function EventsAdvancedFilters({ values, states, onChange, onReset, activeCount }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1">
          <Filter className="h-3.5 w-3.5" />
          Advanced
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Advanced filters</h4>
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">From date</Label>
            <Input
              type="date"
              value={values.from}
              onChange={(e) => onChange({ from: e.target.value })}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">To date</Label>
            <Input
              type="date"
              value={values.to}
              onChange={(e) => onChange({ to: e.target.value })}
              className="h-8"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Custom range overrides the quick-date preset when either field is set.
        </p>

        <div>
          <Label className="text-[11px] uppercase text-muted-foreground">Location contains</Label>
          <Input
            value={values.loc}
            onChange={(e) => onChange({ loc: e.target.value })}
            placeholder="City, park, venue…"
            className="h-8"
          />
        </div>

        <div>
          <Label className="text-[11px] uppercase text-muted-foreground">State / region</Label>
          <Select
            value={values.state || "any"}
            onValueChange={(v) => onChange({ state: v === "any" ? "" : v })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Any state" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="any">Any state</SelectItem>
              {states.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[11px] uppercase text-muted-foreground">Min divisions</Label>
          <Input
            type="number"
            min={0}
            max={30}
            value={values.mind}
            onChange={(e) =>
              onChange({ mind: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })
            }
            className="h-8"
          />
        </div>

        <div className="space-y-1.5 border-t border-border pt-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.cover}
              onChange={(e) => onChange({ cover: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Only events with a cover image
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.crew}
              onChange={(e) => onChange({ crew: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Only events with crew members playing
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}
