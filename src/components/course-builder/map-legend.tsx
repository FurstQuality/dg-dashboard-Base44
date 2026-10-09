import { useState } from "react";
import { Eye, EyeOff, Map as MapIcon } from "lucide-react";
import { FeatureGlyph } from "@/components/map/emblems";
import { FEATURE_CONFIG } from "@/components/leaflet-icon-fix";

type FeatureType = keyof typeof FEATURE_CONFIG;

/** Map key for the builder: lists object types on this map and lets the editor hide each one. */
export function MapLegend({
  types,
  hidden,
  onToggle,
}: {
  types: FeatureType[];
  hidden: Set<FeatureType>;
  onToggle: (t: FeatureType) => void;
}) {
  const [open, setOpen] = useState(false);
  if (types.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-background/95 text-sm shadow">
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 font-medium"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MapIcon className="h-4 w-4" />
        Map key{hidden.size ? ` · ${hidden.size} hidden` : ""}
      </button>
      {open ? (
        <ul className="max-h-64 min-w-48 space-y-0.5 overflow-y-auto border-t border-border p-1.5">
          {types.map((t) => {
            const off = hidden.has(t);
            return (
              <li key={t}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted"
                  onClick={() => onToggle(t)}
                  aria-pressed={!off}
                  title={off ? "Show on map" : "Hide from map"}
                >
                  <FeatureGlyph type={t} size={14} />
                  <span className={off ? "text-muted-foreground line-through" : ""}>{FEATURE_CONFIG[t].label}</span>
                  {off ? (
                    <EyeOff className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Eye className="ml-auto h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
