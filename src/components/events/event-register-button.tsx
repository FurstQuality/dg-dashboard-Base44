/**
 * Sign-up action for any event row in the directory. Events created in Disc Golf
 * Dashboard (and PDGA events with an in-app page) open their event page, where
 * divisions and payment live; listings we only mirror send the player to the
 * source that owns registration.
 */
import { Link } from "@tanstack/react-router";
import { ExternalLink, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnifiedRow } from "./events-types";

export function EventRegisterButton({
  row,
  className,
}: {
  row: UnifiedRow;
  className?: string;
}) {
  const reg = row.register;
  if (!reg) return null;

  const cls = `h-7 gap-1 px-2 text-[11px] font-semibold ${className ?? ""}`;

  if (reg.to) {
    return (
      <Button asChild size="sm" className={cls}>
        <Link to={reg.to as never} params={(reg.params ?? {}) as never}>
          <Ticket className="h-3 w-3" />
          {reg.label}
        </Link>
      </Button>
    );
  }
  if (reg.url) {
    return (
      <Button asChild size="sm" variant="secondary" className={cls}>
        <a href={reg.url} target="_blank" rel="noopener noreferrer">
          {reg.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      </Button>
    );
  }
  return null;
}
