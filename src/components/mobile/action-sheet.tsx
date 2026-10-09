import * as React from "react";
import {
  MobileSheet,
  MobileSheetContent,
  MobileSheetHeader,
  MobileSheetTitle,
  MobileSheetTrigger,
  MobileSheetClose,
} from "./mobile-sheet";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ActionSheetItem = {
  label: string;
  icon?: React.ReactNode;
  description?: string;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * ActionSheet — overflow menu that stays finger-friendly on mobile.
 * Renders a large-target list of actions in a bottom drawer / dialog.
 */
export function ActionSheet({
  trigger,
  title,
  items,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title?: string;
  items: ActionSheetItem[];
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  return (
    <MobileSheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <MobileSheetTrigger asChild>{trigger}</MobileSheetTrigger> : null}
      <MobileSheetContent>
        {title ? (
          <MobileSheetHeader>
            <MobileSheetTitle>{title}</MobileSheetTitle>
          </MobileSheetHeader>
        ) : null}
        <div className="flex flex-col gap-1 p-2">
          {items.map((item, i) => (
            <MobileSheetClose asChild key={i}>
              <Button
                variant="ghost"
                disabled={item.disabled}
                onClick={item.onSelect}
                className={cn(
                  "h-auto min-h-11 w-full justify-start gap-3 px-3 py-3 text-left",
                  item.destructive && "text-destructive hover:text-destructive",
                )}
              >
                {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </Button>
            </MobileSheetClose>
          ))}
        </div>
      </MobileSheetContent>
    </MobileSheet>
  );
}
