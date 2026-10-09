import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/brand-mark";
import { Maximize2, ImageOff } from "lucide-react";
import {
  MobileSheet,
  MobileSheetContent,
  MobileSheetHeader,
  MobileSheetTitle,
} from "@/components/mobile/mobile-sheet";

/**
 * Center-stage active-hole visual.
 * Priority: hole image → tee-to-basket render (via `renderMap` slot) → branded fallback.
 * Aspect ratio locked so scoring controls never jump on image load.
 */
export function HoleStage({
  holeNumber,
  par,
  distanceFt,
  nickname,
  imageUrl,
  features,
  renderMap,
  renderSign,
  overlay,
  className,
}: {
  holeNumber: number;
  par: number;
  distanceFt?: number | null;
  nickname?: string | null;
  imageUrl?: string | null;
  /** Mapped hole features from the Course Builder, e.g. ["2 mandatories", "OB line"]. */
  features?: string[];
  /** Optional slot for a live GPS / caddy overlay rendered on top of the visual. */
  renderMap?: React.ReactNode;
  /** Tee sign drawing for this hole; when given, a toggle switches between photo and sign. */
  renderSign?: React.ReactNode;
  overlay?: React.ReactNode;
  className?: string;
}) {

  const [expanded, setExpanded] = React.useState(false);
  const [view, setView] = React.useState<"photo" | "sign">("photo");
  React.useEffect(() => {
    const v = localStorage.getItem("dgd:hole-view");
    if (v === "sign" || v === "photo") setView(v);
  }, []);
  const pickView = (v: "photo" | "sign") => { setView(v); localStorage.setItem("dgd:hole-view", v); };
  const showSign = !!renderSign && view === "sign";

  return (
    <div
      className={cn(
        "mx-auto flex h-full w-full max-w-[900px] flex-col px-2 pt-2 sm:px-4 sm:pt-3",
        className,
      )}
    >
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-neutral-950/60 shadow-sm",
        )}
      >
        {showSign ? (
          <div className="absolute inset-0 bg-neutral-950">{renderSign}</div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={`Hole ${nickname?.trim() || holeNumber} tee sign`}
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
            fetchPriority="high"
          />
        ) : renderMap ? (
          <div className="absolute inset-0">{renderMap}</div>
        ) : (
          <FallbackPlate holeNumber={holeNumber} par={par} distanceFt={distanceFt} />
        )}

        {overlay && !showSign ? <div className="pointer-events-none absolute inset-0">{overlay}</div> : null}
        {renderSign ? (
          <div role="group" aria-label="Hole view" className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 rounded-full bg-black/65 p-0.5 text-xs font-semibold text-white backdrop-blur">
            {(["photo", "sign"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => pickView(v)}
                className={"min-h-9 rounded-full px-3 " + (view === v ? "bg-white text-neutral-900" : "text-white/85")}>
                {v === "photo" ? "Photo" : "Tee sign"}
              </button>
            ))}
          </div>
        ) : null}

        {/* Corner labels */}
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
          Hole {nickname?.trim() || holeNumber} · Par {par}
          {distanceFt ? <span className="ml-1 text-white/75">· {distanceFt} ft</span> : null}
        </div>

        {features && features.length > 0 ? (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {features.map((f) => (
              <span
                key={f}
                className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"
              >
                {f}
              </span>
            ))}
          </div>
        ) : null}

        {imageUrl ? (
          <Button
            variant="secondary"
            size="icon"

            aria-label="Enlarge hole visual"
            className="absolute right-2 top-2 h-9 w-9 bg-black/50 text-white hover:bg-black/70"
            onClick={() => setExpanded(true)}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <MobileSheet open={expanded} onOpenChange={setExpanded}>
        <MobileSheetContent className="max-w-3xl">
          <MobileSheetHeader>
            <MobileSheetTitle>
              Hole {nickname?.trim() || holeNumber} · Par {par}
              {distanceFt ? ` · ${distanceFt} ft` : ""}
            </MobileSheetTitle>
          </MobileSheetHeader>
          <div className="grid place-items-center p-2">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`Hole ${nickname?.trim() || holeNumber} enlarged`}
                className="max-h-[75dvh] w-auto rounded-lg"
              />
            ) : (
              <FallbackPlate holeNumber={holeNumber} par={par} distanceFt={distanceFt} />
            )}
          </div>
        </MobileSheetContent>
      </MobileSheet>
    </div>
  );
}

function FallbackPlate({
  holeNumber,
  par,
  distanceFt,
}: {
  holeNumber: number;
  par: number;
  distanceFt?: number | null;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white">
      <BrandMark variant="compact" className="h-8 w-auto opacity-80" />
      <div className="text-center">
        <div className="font-display text-5xl font-bold tabular-nums leading-none">
          {holeNumber}
        </div>
        <div className="mt-2 text-xs uppercase tracking-wide text-white/70">
          Par {par}
          {distanceFt ? ` · ${distanceFt} ft` : ""}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/50">
        <ImageOff className="h-3.5 w-3.5" />
        <span>No tee sign uploaded</span>
      </div>
    </div>
  );
}
