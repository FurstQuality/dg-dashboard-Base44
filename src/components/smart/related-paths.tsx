import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { relatedFor } from "@/lib/smart-routes";

/**
 * Compact row of the pages that pair with the current one ("Maple Hill? you
 * probably want the course book next"). One quiet text row per page — never a
 * stack of buttons. Renders nothing when the current page has no pairing.
 */
export function RelatedPaths({ className, limit = 4 }: { className?: string; limit?: number }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const links = relatedFor(pathname, limit);
  if (links.length === 0) return null;

  return (
    <nav
      aria-label="Related pages"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}
    >
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        Go next
      </span>
      {links.map((link) => (
        <Link
          key={link.href}
          to={link.href as never}
          title={link.description}
          className="text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
