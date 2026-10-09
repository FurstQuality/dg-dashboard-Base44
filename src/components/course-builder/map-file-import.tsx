import { useState } from "react";
import { CircleMarker, Polygon, Polyline } from "react-leaflet";
import { FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseMapFile, type ImportedShape } from "@/lib/course-builder/map-file-import";
import type { CourseFeatureType } from "@/lib/course-features";

const CHOICES: Record<ImportedShape["kind"], { value: CourseFeatureType; label: string }[]> = {
  point: [
    { value: "note", label: "Notes" },
    { value: "parking", label: "Parking" },
    { value: "restroom", label: "Restrooms" },
    { value: "bench", label: "Benches" },
    { value: "trash", label: "Trash cans" },
    { value: "dropzone", label: "Drop zones" },
  ],
  line: [
    { value: "ob_line", label: "OB lines" },
    { value: "path", label: "Paths" },
    { value: "fence", label: "Fences" },
  ],
  area: [
    { value: "ob_area", label: "OB areas" },
    { value: "water", label: "Water" },
    { value: "course_boundary", label: "Course boundary" },
  ],
};
const KIND_LABEL = { point: "points", line: "lines", area: "areas" } as const;

export type ImportPreview = { shapes: ImportedShape[] } | null;

/** Draws the shapes waiting to be added, dashed, so they can be checked against the aerial first. */
export function MapFilePreviewLayer({ preview }: { preview: ImportPreview }) {
  if (!preview) return null;
  const style = { color: "hsl(var(--warning))", weight: 2, dashArray: "6 4" };
  return (
    <>
      {preview.shapes.map((s, i) =>
        s.kind === "point" ? (
          <CircleMarker key={i} center={s.points[0]} radius={6} pathOptions={style} />
        ) : s.kind === "line" ? (
          <Polyline key={i} positions={s.points} pathOptions={style} />
        ) : (
          <Polygon key={i} positions={s.points} pathOptions={{ ...style, fillOpacity: 0.1 }} />
        ),
      )}
    </>
  );
}

export function MapFileImportControl({
  preview,
  onPreview,
  onAdd,
  onZoomTo,
}: {
  preview: ImportPreview;
  onPreview: (p: ImportPreview) => void;
  onAdd: (items: { type: CourseFeatureType; label: string; points: [number, number][] }[]) => void;
  onZoomTo: (points: [number, number][]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [fileName, setFileName] = useState("");
  const [types, setTypes] = useState<Record<ImportedShape["kind"], CourseFeatureType>>({
    point: "note", line: "ob_line", area: "ob_area",
  });
  const [include, setInclude] = useState<Record<ImportedShape["kind"], boolean>>({
    point: true, line: true, area: true,
  });

  if (!preview) {
    return (
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-sm hover:bg-accent">
        <FileUp className="h-4 w-4" /> Bring in a map file
        <input
          type="file"
          accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) return setError("That file is over 5 MB.");
            try {
              const r = parseMapFile(f.name, await f.text());
              if (!r.shapes.length) return setError("No usable shapes were found in that file.");
              setError(null);
              setSkipped(r.skipped);
              setFileName(f.name);
              onPreview({ shapes: r.shapes });
              onZoomTo(r.shapes.flatMap((s) => s.points));
            } catch (err) {
              setError(err instanceof Error ? err.message : "That file couldn't be read.");
            }
          }}
        />
        {error ? <span className="ml-2 text-destructive">{error}</span> : null}
      </label>
    );
  }

  const counts = { point: 0, line: 0, area: 0 };
  for (const s of preview.shapes) counts[s.kind]++;
  const chosen = preview.shapes.filter((s) => include[s.kind]);

  return (
    <div className="w-72 space-y-2 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium" title={fileName}>Check before adding</span>
        <button aria-label="Cancel" onClick={() => onPreview(null)} className="rounded p-1 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="text-muted-foreground">
        Dashed shapes on the map come from {fileName}. Check they line up with the aerial, then choose what each kind becomes.
      </p>
      {(["point", "line", "area"] as const).map((k) =>
        counts[k] ? (
          <div key={k} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={include[k]}
              onChange={(e) => setInclude({ ...include, [k]: e.target.checked })}
              aria-label={`Include ${KIND_LABEL[k]}`}
            />
            <span className="w-20">{counts[k]} {KIND_LABEL[k]}</span>
            <select
              value={types[k]}
              disabled={!include[k]}
              onChange={(e) => setTypes({ ...types, [k]: e.target.value as CourseFeatureType })}
              className="flex-1 rounded-md border border-input bg-background px-1 py-0.5"
            >
              {CHOICES[k].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        ) : null,
      )}
      {skipped ? <p className="text-muted-foreground">{skipped} shapes were left out because their positions weren't usable.</p> : null}
      <Button
        size="sm"
        className="w-full"
        disabled={!chosen.length}
        onClick={() => {
          onAdd(chosen.map((s) => ({ type: types[s.kind], label: s.name, points: s.points })));
          onPreview(null);
        }}
      >
        Add {chosen.length} to the map
      </Button>
      <p className="text-muted-foreground">They're added as course-wide objects and aren't saved until you save.</p>
    </div>
  );
}
