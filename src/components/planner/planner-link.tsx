/** Typed router link for a planner occurrence, based on which source it came from. */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PlannerOccurrence } from "@/lib/planner";

export function PlannerLink({
  occurrence,
  className,
  children,
}: {
  occurrence: PlannerOccurrence;
  className?: string;
  children: ReactNode;
}) {
  const { slug, eventId, source } = occurrence;
  if (!slug) return <span className={className}>{children}</span>;

  if (source === "pdga") {
    return (
      <Link to="/events/pdga/$eventRef" params={{ eventRef: slug }} className={className}>
        {children}
      </Link>
    );
  }
  if (eventId.startsWith("l:")) {
    return (
      <Link to="/leagues/$slug" params={{ slug }} className={className}>
        {children}
      </Link>
    );
  }
  if (eventId.startsWith("t:")) {
    return (
      <Link to="/tournaments/$slug" params={{ slug }} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/community/$eventId" params={{ eventId: slug }} className={className}>
      {children}
    </Link>
  );
}
