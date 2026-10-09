import { X } from "lucide-react";

export interface ChipDef {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  chips: ChipDef[];
  onClearAll: () => void;
}

/** Removable filter chip row shown above results — one chip per active filter. */
export function EventsActiveChips({ chips, onClearAll }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Active
      </span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
          title={`Remove ${c.label}`}
        >
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}
