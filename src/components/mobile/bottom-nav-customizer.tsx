import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Check, Globe, RotateCcw } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { BOTTOM_NAV_SLOTS } from "@/hooks/use-bottom-nav-prefs";
import { toast } from "sonner";

export type BottomNavChoice = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

/**
 * Lets a player pick which sections sit in the phone bottom bar. Choices are
 * kept in the order they were tapped, so the bar reads left to right the way
 * they built it. "More" always keeps the last slot.
 */
export function BottomNavCustomizer({
  open,
  onOpenChange,
  choices,
  selected,
  onSave,
  onReset,
  canSetAppDefault = false,
  onSaveAsAppDefault,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choices: BottomNavChoice[];
  selected: string[];
  onSave: (keys: string[]) => void | Promise<void>;
  onReset: () => void | Promise<void>;
  canSetAppDefault?: boolean;
  onSaveAsAppDefault?: (keys: string[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string[]>(selected);

  useEffect(() => {
    if (open) setDraft(selected);
  }, [open, selected]);

  const full = draft.length >= BOTTOM_NAV_SLOTS;

  function toggle(key: string) {
    setDraft((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= BOTTOM_NAV_SLOTS) {
        toast.info(`You can pin ${BOTTOM_NAV_SLOTS} buttons — remove one to swap it out.`);
        return cur;
      }
      return [...cur, key];
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-h-[88dvh]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>Choose your bottom buttons</DrawerTitle>
          <DrawerDescription>
            Pick up to {BOTTOM_NAV_SLOTS} buttons for the two rows at the bottom of your screen.
            They appear in the order you tap them, and More always stays on the end.
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 space-y-1.5 overflow-y-auto px-4 pb-3">
          {choices.map((choice) => {
            const Icon = choice.icon;
            const index = draft.indexOf(choice.key);
            const picked = index >= 0;
            return (
              <button
                key={choice.key}
                type="button"
                onClick={() => toggle(choice.key)}
                aria-pressed={picked}
                disabled={!picked && full}
                className={
                  "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors " +
                  (picked
                    ? "border-primary/60 bg-primary/10"
                    : full
                      ? "border-border bg-card opacity-50"
                      : "border-border bg-card hover:bg-muted")
                }
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{choice.label}</span>
                {picked ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    Slot {index + 1}
                    <Check className="h-3.5 w-3.5" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Button
            className="flex-1"
            onClick={() => {
              if (draft.length === 0) {
                toast.info("Pick at least one section for the bottom bar.");
                return;
              }
              void onSave(draft);
              onOpenChange(false);
              toast.success("Bottom bar saved to your account.");
            }}
          >
            Save bottom bar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void onReset();
              onOpenChange(false);
              toast.success("Bottom bar back to the default sections.");
            }}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
          </Button>
          {canSetAppDefault && onSaveAsAppDefault ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                if (draft.length === 0) {
                  toast.info("Pick at least one section first.");
                  return;
                }
                const ok = await onSaveAsAppDefault(draft);
                toast[ok ? "success" : "error"](
                  ok
                    ? "These are now the default bottom buttons for everyone."
                    : "Could not set the app default. Try again.",
                );
              }}
            >
              <Globe className="mr-1.5 h-4 w-4" /> Set as app default
            </Button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
