import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSession, useIsSuperAdmin } from "@/lib/current-user";
import { openAppTour } from "@/components/onboarding/app-tour";
import { InstallAppCard } from "@/components/install-app-card";
import { SETTINGS_AREAS } from "./settings";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "All settings · DG Dashboard" },
      {
        name: "description",
        content:
          "Every DG Dashboard setting in one place: player details, connected rounds, calendar, notifications, privacy, look & feel, and your plan.",
      },
      { property: "og:title", content: "All settings · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Player details, connected rounds, calendar, notifications, privacy, look & feel, and your plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsOverview,
});

type Tile = {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
};

const ADMIN_TILES: Tile[] = [
  {
    to: "/admin",
    label: "Admin dashboard",
    description: "Moderation queues, course ratings, platform config, tiers & billing.",
    icon: ShieldCheck,
    hint: "Admins only",
  },
];

function SettingsOverview() {
  const { user } = useSession();
  const isAdmin = useIsSuperAdmin(user);

  return (
    <div className="space-y-6">
      <TileGrid tiles={SETTINGS_AREAS} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={openAppTour}>
          <Compass className="mr-1.5 h-4 w-4" />
          Take the app tour
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/home">
            Back to your feed
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <InstallAppCard />

      {isAdmin && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Platform administration
          </div>
          <TileGrid tiles={ADMIN_TILES} />
        </div>
      )}
    </div>
  );
}

function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition",
              "hover:border-primary/50 hover:bg-card/80",
            )}
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{t.label}</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <div className="text-xs text-muted-foreground">{t.description}</div>
              {t.hint && (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {t.hint}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
