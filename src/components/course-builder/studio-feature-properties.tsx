type ObSide = "left" | "right" | "past" | "behind" | "none";

export function StudioFeatureProperties({
  feature,
  onChange,
}: {
  feature: { type: string; canopy_m?: number | null; bearing?: number | null; ob_side: string };
  onChange: (patch: { canopy_m?: number | null; bearing?: number; ob_side?: ObSide }) => void;
}) {
  return (
    <div className="space-y-3">
      {feature.type === "tree" && (
        <label className="block text-xs">
          Tree width
          <select
            aria-label="Tree width"
            value={feature.canopy_m ?? ""}
            className="mt-1 block w-full rounded border bg-background p-2"
            onChange={(e) => onChange({ canopy_m: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Typical · 8 m</option>
            <option value="4">Small · 4 m</option>
            <option value="12">Large · 12 m</option>
            <option value="18">Very large · 18 m</option>
          </select>
        </label>
      )}
      {(feature.type === "mando" || feature.type === "dropzone") && (
        <label className="block text-xs">
          Direction · {Math.round(feature.bearing ?? 0)}°
          <input
            type="range"
            aria-label="Item direction"
            min="0"
            max="359"
            value={feature.bearing ?? 0}
            onChange={(e) => onChange({ bearing: Number(e.target.value) })}
            className="mt-1 block w-full"
          />
        </label>
      )}
      {feature.type === "mando" && (
        <label className="block text-xs">
          Required pass
          <select
            aria-label="Required pass"
            value={feature.ob_side}
            className="mt-1 block w-full rounded border bg-background p-2"
            onChange={(e) => onChange({ ob_side: e.target.value as ObSide })}
          >
            <option value="none">Not set</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="past">Past / through</option>
          </select>
        </label>
      )}
      {(feature.type === "ob_line" || feature.type === "ob_reference") && (
        <label className="block text-xs">
          Out of bounds side
          <select
            aria-label="OB side"
            value={feature.ob_side}
            className="mt-1 block w-full rounded border bg-background p-2"
            onChange={(e) => onChange({ ob_side: e.target.value as ObSide })}
          >
            <option value="none">Line only</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      )}
    </div>
  );
}
