import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Palette as PaletteIcon, Sparkles, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import { ThemeControls, ThemeActions } from "@/components/theme/theme-controls";

/**
 * Personalize panel. Renders the exact same controls as Settings → Look & feel
 * (both use ThemeControls over the shared theme context), so a change in either
 * place is reflected in the other immediately.
 */
export function ThemeStudioButton({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
} = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <SheetTrigger asChild>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition-colors hover:text-primary hover:border-primary/60"
            aria-label="Personalize the app"
            title="Personalize"
          >
            <PaletteIcon className="h-[18px] w-[18px]" />
          </button>
        </SheetTrigger>
      )}

      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto p-0">
        <SheetHeader className="border-b border-border/60 p-4">
          <SheetTitle className="flex items-center gap-2 font-graphic text-2xl tracking-wide">
            <Sparkles className="h-5 w-5 text-primary" /> Personalize
          </SheetTitle>
          <SheetDescription>
            A few simple choices. Previews live, syncs across your devices.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-4 pb-24">
          <ThemeControls variant="panel" />
          <ThemeActions variant="panel" />
          <Link
            to="/settings/personalization"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Open Look &amp; feel in Settings
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
