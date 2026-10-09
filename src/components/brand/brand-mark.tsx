import { cn } from "@/lib/utils";
import { BRAND_NAME, BRAND_FORMAL, BRAND_ATTRIBUTION, BRAND_TAGLINE } from "@/lib/brand";

type Variant = "compact" | "horizontal" | "formal" | "mono";

interface BrandMarkProps {
  variant?: Variant;
  className?: string;
  /** Show "Powered by Ace" beneath the wordmark. */
  showAttribution?: boolean;
  /** Show the tagline beneath the wordmark (formal variant only). */
  showTagline?: boolean;
}

/**
 * The DG Dashboard basket-target glyph. Reads as a simplified chain basket
 * viewed head-on: a solid center pole with three concentric rings.
 */
function BasketGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("h-full w-full", className)}>
      {/* outer ring */}
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.55"
      />
      {/* middle ring */}
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.8"
      />
      {/* inner basket disc */}
      <circle cx="16" cy="16" r="4" fill="currentColor" />
      {/* chain accents */}
      <path
        d="M16 3 L16 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M16 24 L16 29"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

export function BrandMark({
  variant = "horizontal",
  className,
  showAttribution = false,
  showTagline = false,
}: BrandMarkProps) {
  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary",
          className,
        )}
        aria-label={BRAND_NAME}
      >
        <BasketGlyph className="h-5 w-5" />
      </span>
    );
  }

  if (variant === "mono") {
    return (
      <span className={cn("inline-flex items-center gap-2 text-current", className)}>
        <BasketGlyph className="h-5 w-5" />
        <span className="font-display text-base font-bold tracking-tight">{BRAND_NAME}</span>
      </span>
    );
  }

  if (variant === "formal") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <BasketGlyph className="h-6 w-6" />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight leading-none">
            {BRAND_FORMAL}
          </span>
        </div>
        {showTagline ? <p className="text-sm text-muted-foreground">{BRAND_TAGLINE}</p> : null}
      </div>
    );
  }

  // horizontal (default)
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <BasketGlyph className="h-5 w-5" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg font-extrabold tracking-tight">{BRAND_NAME}</span>
        {showAttribution ? (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {BRAND_ATTRIBUTION}
          </span>
        ) : null}
      </span>
    </span>
  );
}
