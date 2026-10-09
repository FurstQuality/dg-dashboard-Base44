/**
 * Sticky admin section navigation.
 *
 * Stays pinned under the app header on every admin page so moving between
 * queues, data tools, and billing never requires going back to the dashboard.
 * Phones use a compact selector so the navigation does not cover the page.
 */
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutGrid,
  MapPin,
  Gauge,
  RotateCcw,
  Flag,
  Store,
  Sparkles,
  ShieldCheck,
  Radar,
  Disc3,
  FlaskConical,
  Sliders,
  Layers,
  CreditCard,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminNavLink = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ADMIN_LINKS: AdminNavLink[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutGrid },
  { to: "/admin/operations", label: "Platform operations", icon: Sliders },
  { to: "/admin/moderation", label: "Course moderation", icon: MapPin },
  { to: "/admin/course-ratings", label: "Course ratings", icon: Gauge },
  { to: "/admin/revert-queue", label: "Revert requests", icon: RotateCcw },
  { to: "/admin/reports", label: "Reported posts", icon: Flag },
  { to: "/admin/marketplace", label: "Marketplace review", icon: Store },
  { to: "/admin/creators", label: "Creator review", icon: Sparkles },
  { to: "/admin/directors", label: "Event Director review", icon: ShieldCheck },
  { to: "/admin/data-intelligence", label: "Data Intelligence", icon: Radar },
  { to: "/admin/beta", label: "Beta feedback", icon: FlaskConical },
  { to: "/admin/sandbox", label: "App sandbox", icon: FlaskConical },
  { to: "/admin/platform", label: "Platform config", icon: Sliders },
  { to: "/admin/fields", label: "Field registry", icon: Sliders },
  { to: "/admin/tiers", label: "Plans & pricing", icon: Layers },
  { to: "/admin/features", label: "Feature matrix", icon: Sliders },
  { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { to: "/admin/billing-events", label: "Billing events", icon: Receipt },
  { to: "/admin/payout-curves", label: "Payout curves", icon: Receipt },
];

export function AdminSubnav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const selected = ADMIN_LINKS.find(link => link.to !== "/admin" && pathname.startsWith(link.to))?.to ?? "/admin";

  return (
    <div className="sticky top-16 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
      <label className="flex items-center gap-3 px-5 py-2 text-xs font-medium md:hidden">
        Admin tool
        <select aria-label="Admin tool" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" value={selected} onChange={e => void navigate({ to: e.target.value })}>
          {ADMIN_LINKS.map(link => <option key={link.to} value={link.to}>{link.label}</option>)}
        </select>
      </label>
      <nav
        aria-label="Admin tools"
        className="mx-auto hidden w-full max-w-[1560px] flex-wrap gap-1 px-5 py-2 md:flex lg:px-8 2xl:max-w-[1840px] 2xl:px-10"
      >
        {ADMIN_LINKS.map((link) => {
          const active =
            link.to === "/admin" ? pathname === "/admin" : pathname.startsWith(link.to);
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition",
                active
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
