import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin/data-intelligence", label: "Overview" },
  { to: "/admin/course-buildout", label: "Course Atlas" },
  { to: "/admin/data-jobs", label: "Jobs & Health" },
  { to: "/admin/data-definitions", label: "Definitions" },
  { to: "/admin/pdga-kb", label: "PDGA" },
  { to: "/admin/disc-intel", label: "Disc Intelligence" },
] as const;

/** One section bar so the hub and its source tools read as one home. */
export function DataIntelTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Data Intelligence sections" className="mb-5 flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
