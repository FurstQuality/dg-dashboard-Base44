import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { FlaskConical, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export type MoreNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  desc?: string;
};

export type MoreNavGroup = {
  key: string;
  label: string;
  items: MoreNavItem[];
};

/**
 * "More" sheet for phones. The top grid jumps to a whole section; everything
 * else is collapsed into one row per section so the sheet stays short and
 * scannable while keeping every tool reachable on a small screen.
 */
export function MoreNavSheet({
  open,
  onOpenChange,
  groups,
  onCustomizeBottomNav,
  onSendBetaFeedback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: MoreNavGroup[];
  /** Opens the picker for the bottom-bar buttons. */
  onCustomizeBottomNav?: () => void;
  /** Opens the beta feedback form (phones have no floating launcher). */
  onSendBetaFeedback?: () => void;
}) {
  const sections = groups.find((g) => g.key === "sections");
  const rest = groups.filter((g) => g.key !== "sections" && g.items.length > 0);
  const close = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-h-[88dvh]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>Everywhere you can go</DrawerTitle>
          <DrawerDescription>Tap a section, or open one to see its tools.</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto px-4 pb-6">
          {sections && sections.items.length > 0 ? (
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {sections.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={`section-${item.to}`}
                    to={item.to}
                    onClick={close}
                    className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-center transition-colors hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <Accordion type="single" collapsible className="border-t border-border">
            {rest.map((group) => (
              <AccordionItem key={group.key} value={group.key}>
                <AccordionTrigger className="py-2.5 text-sm font-semibold">
                  {group.label}
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <div className="grid grid-cols-1 gap-1.5">
                    {group.items.map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={`${group.key}-${index}-${item.to}`}
                          to={item.to}
                          onClick={close}
                          className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0 text-sm font-medium">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {onCustomizeBottomNav || onSendBetaFeedback ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {onCustomizeBottomNav ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center"
                  onClick={() => {
                    close();
                    onCustomizeBottomNav();
                  }}
                >
                  <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                  Bottom buttons
                </Button>
              ) : null}
              {onSendBetaFeedback ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center"
                  onClick={() => {
                    close();
                    onSendBetaFeedback();
                  }}
                >
                  <FlaskConical className="mr-1.5 h-4 w-4" />
                  Feedback
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
