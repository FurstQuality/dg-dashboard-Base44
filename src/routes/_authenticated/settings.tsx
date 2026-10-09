import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import {
  Settings,
  User,
  Bell,
  Lock,
  Calendar,
  Palette,
  CreditCard,
  Database,
  ShieldCheck,
  Activity,
  Backpack,
} from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { useSession, useIsSuperAdmin } from "@/lib/current-user";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
  head: () => ({
    meta: [
      { title: "Settings · DG Dashboard" },
      {
        name: "description",
        content:
          "Manage your DG Dashboard account: player details, connected data sources, calendar, notifications, privacy, look & feel, and subscription.",
      },
      { property: "og:title", content: "Settings · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Manage your player details, data sources, calendar, notifications, privacy, and subscription.",
      },
    ],
  }),
});

type NavItem = {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

/** Every settings area, in one flat list — no ordering, no prerequisites. */
export const SETTINGS_AREAS: NavItem[] = [
  {
    to: "/settings/profile",
    label: "Player details",
    description: "Name, home course, PDGA number, photo, bio",
    icon: User,
  },
  {
    to: "/settings/imports",
    label: "Data & sync",
    description: "PDGA, UDisc, and Disc Golf Scene rounds and ratings",
    icon: Database,
  },
  {
    to: "/settings/bag",
    label: "Throw profile & bag",
    description: "Power, measured numbers, shot shapes, and your discs",
    icon: Backpack,
  },
  {
    to: "/settings/calendar",
    label: "Calendar",
    description: "Tee times and league nights on your own calendar",
    icon: Calendar,
  },
  {
    to: "/settings/notifications",
    label: "Notifications",
    description: "Push, email, and quiet hours",
    icon: Bell,
  },
  {
    to: "/settings/privacy",
    label: "Privacy",
    description: "Who can see your rounds, ratings, and schedule",
    icon: Lock,
  },
  {
    to: "/settings/data",
    label: "Your data",
    description: "Every kind of data we keep, and what stays public or private",
    icon: Database,
  },
  {
    to: "/settings/personalization",
    label: "Look & feel",
    description: "Theme, accent color, density, text size",
    icon: Palette,
  },
  {
    to: "/settings/billing",
    label: "Subscription",
    description: "Your plan, invoices, and upgrades",
    icon: CreditCard,
  },
  {
    to: "/settings/data-health",
    label: "Data health",
    description: "What's synced, what's missing, what needs a refresh",
    icon: Activity,
  },
];

const OVERVIEW_ITEM: NavItem = {
  to: "/settings",
  label: "All settings",
  description: "Everything in one place",
  icon: Settings,
};

const ADMIN_NAV: NavItem[] = [
  {
    to: "/admin",
    label: "Admin dashboard",
    description: "Moderation, tiers, platform config",
    icon: ShieldCheck,
  },
];

function SettingsLayout() {
  const { user } = useSession();
  const isAdmin = useIsSuperAdmin(user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = SETTINGS_AREAS.find((s) => isActive(pathname, s.to)) ?? null;

  return (
    <PageShell>
      <PageHeader
        title={current ? current.label : "Settings"}
        description={
          current
            ? current.description
            : "Manage your account, connected rounds, and preferences. Change anything any time — nothing here locks you in."
        }
        eyebrow="Settings"
      />
      {/* min-w-0 everywhere: without it the settings menu sizes to its widest
          label and pushes the page off the side of a phone screen. */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {/* Phones get one scrollable row of settings areas; desktop keeps the list. */}
          <nav className="flex gap-1 flex-wrap rounded-xl border border-border bg-card p-2 lg:flex-col lg:overflow-x-visible">
            <SettingsNavLink item={OVERVIEW_ITEM} active={isActive(pathname, OVERVIEW_ITEM.to)} />
            <div className="mt-3 mb-1 hidden px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:block">
              Your account
            </div>
            {SETTINGS_AREAS.map((item) => (
              <SettingsNavLink key={item.to} item={item} active={isActive(pathname, item.to)} />
            ))}
            {isAdmin && (
              <>
                <div className="mt-3 mb-1 hidden px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:block">
                  Admin
                </div>
                {ADMIN_NAV.map((item) => (
                  <SettingsNavLink key={item.to} item={item} active={isActive(pathname, item.to)} />
                ))}
              </>
            )}
          </nav>
        </aside>
        <main className="min-w-0 space-y-4">
          <Outlet />
        </main>
      </div>
    </PageShell>
  );
}

function isActive(pathname: string, to: string) {
  if (to === "/settings") return pathname === "/settings" || pathname === "/settings/";
  return pathname === to || pathname.startsWith(to + "/");
}

function SettingsNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition lg:w-full lg:shrink lg:items-start lg:gap-3 lg:whitespace-normal",
        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 lg:mt-0.5",
          active ? "text-primary" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <div className="font-medium leading-tight">{item.label}</div>
        <div className="mt-0.5 hidden text-xs leading-snug text-muted-foreground lg:block">
          {item.description}
        </div>
      </div>
    </Link>
  );
}
