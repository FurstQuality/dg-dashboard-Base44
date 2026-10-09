import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Gauge,
  FlaskConical,
  ArrowRight,
  Sliders,
  RotateCcw,
  Radar,
  CreditCard,
  Layers,
  Receipt,
  Sparkles,
  Flag,
  Store,
  Disc3,
} from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminHome,
  head: () => ({
    meta: [
      { title: "Admin dashboard · DG Dashboard" },
      {
        name: "description",
        content:
          "Central admin dashboard with moderation, course ratings, sandbox data, and role tools.",
      },
      { property: "og:title", content: "Admin dashboard · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Central admin dashboard with moderation, course ratings, sandbox data, and role tools.",
      },
    ],
  }),
});

type ToolCard = {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
  accent: string;
};

function AdminHome() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();

  const counts = useQuery({
    queryKey: ["admin", "dashboard-counts"],
    enabled: !!user && isAdmin,
    staleTime: 30_000,
    queryFn: async () => {
      const [
        pendingCourses,
        pendingEdits,
        pendingRatings,
        mockRows,
        pendingReverts,
        pendingReports,
      ] = await Promise.all([
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("moderation_status", "pending"),
        supabase
          .from("course_edit_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("course_rating_profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("mock_seed_registry").select("id", { count: "exact", head: true }),
        supabase
          .from("revert_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("post_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      return {
        pendingCourses: pendingCourses.count ?? 0,
        pendingEdits: pendingEdits.count ?? 0,
        pendingRatings: pendingRatings.count ?? 0,
        mockRows: mockRows.count ?? 0,
        pendingReverts: pendingReverts.count ?? 0,
        pendingReports: pendingReports.count ?? 0,
      };
    },
  });

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <PageShell>
        <PageHeader
          title="Admin only"
          description="You need super admin access to open the admin dashboard."
        />
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          Access denied.
        </div>
      </PageShell>
    );
  }

  const c = counts.data;

  const reviewTools: ToolCard[] = [
    {
      to: "/admin/moderation",
      title: "Course moderation",
      description: "Approve, reject, merge, or revoke user-submitted courses and edit requests.",
      icon: MapPin,
      badge: c ? c.pendingCourses + c.pendingEdits : null,
      accent: "from-primary/15 to-primary/5 ring-primary/25",
    },
    {
      to: "/admin/course-ratings",
      title: "Course ratings",
      description: "Review PDGA SSA / stroke-value submissions and lock official course ratings.",
      icon: Gauge,
      badge: c?.pendingRatings ?? null,
      accent: "from-amber-500/15 to-amber-500/5 ring-amber-500/30",
    },
    {
      to: "/admin/revert-queue",
      title: "Revert requests",
      description:
        "Review owner-initiated revert requests on courses, ratings, events, and profiles.",
      icon: RotateCcw,
      badge: c?.pendingReverts ?? null,
      accent: "from-rose-500/15 to-rose-500/5 ring-rose-500/30",
    },
    {
      to: "/admin/reports",
      title: "Reported posts",
      description: "Work through reported posts and comments, then resolve or dismiss each one.",
      icon: Flag,
      badge: c?.pendingReports ?? null,
      accent: "from-red-500/15 to-red-500/5 ring-red-500/30",
    },
    {
      to: "/admin/event-claims",
      title: "Organizer claims",
      description: "Check players who say they organized an imported event, then approve or decline.",
      icon: Flag,
      accent: "from-red-500/15 to-red-500/5 ring-red-500/30",
    },
    {
      to: "/admin/rewards",
      title: "Contributor rewards",
      description: "Review reward requests from players who mapped courses and reported conditions.",
      icon: Flag,
      accent: "from-red-500/15 to-red-500/5 ring-red-500/30",
    },
    {
      to: "/admin/clubhouse-reports",
      title: "Clubhouse reports",
      description: "Review players reported in the Clubhouse and event rooms, then mark each one reviewed or dismissed.",
      icon: Flag,
      accent: "from-red-500/15 to-red-500/5 ring-red-500/30",
    },
    {
      to: "/admin/marketplace",
      title: "Marketplace review",
      description: "Check flagged listings, suspicious pricing, and seller reports.",
      icon: Store,
      accent: "from-orange-500/15 to-orange-500/5 ring-orange-500/30",
    },
    {
      to: "/admin/creators",
      title: "Creator review",
      description: "Approve creator applications, set tiers, and manage ambassador status.",
      icon: Sparkles,
      accent: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/30",
    },
    {
      to: "/admin/directors",
      title: "Event Director review",
      description:
        "Approve, reject, or remove Event Director access for tournament and league hosts.",
      icon: ShieldCheck,
      accent: "from-amber-500/15 to-amber-500/5 ring-amber-500/30",
    },
  ];

  const dataTools: ToolCard[] = [
    {
      to: "/admin/operations",
      title: "Connectors & platform operations",
      description: "Cloud tools, provider connections, secrets, AI activity, security, Git and project settings.",
      icon: Sliders,
      accent: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/30",
    },
    {
      to: "/admin/data-intelligence",
      title: "Data Intelligence",
      description:
        "One home for PDGA, UDisc, Disc Golf Scene, course build-out and disc data: coverage, health and conflicts.",
      icon: Radar,
      accent: "from-cyan-500/15 to-cyan-500/5 ring-cyan-500/30",
    },
    {
      to: "/admin/beta",
      title: "Beta feedback",
      description:
        "Run beta mode, brief testers, and work through every bug, idea, and page rating.",
      icon: FlaskConical,
      accent: "from-cyan-500/15 to-cyan-500/5 ring-cyan-500/30",
    },
    {
      to: "/admin/sandbox",
      title: "Sandbox data",
      description: "Seed and unseed demo rounds, players, and events without touching real data.",
      icon: FlaskConical,
      badge: c?.mockRows ?? null,
      accent: "from-violet-500/15 to-violet-500/5 ring-violet-500/30",
    },
    {
      to: "/admin/platform",
      title: "Platform config",
      description: "Brand copy, rating engine, XP curve, and global feature flags.",
      icon: Sliders,
      accent: "from-sky-500/15 to-sky-500/5 ring-sky-500/30",
    },
    {
      to: "/admin/fields",
      title: "Field registry",
      description:
        "Configure labels, help text, groups, and edit permissions for every editable field.",
      icon: Sliders,
      accent: "from-teal-500/15 to-teal-500/5 ring-teal-500/30",
    },
  ];

  const billingTools: ToolCard[] = [
    {
      to: "/admin/tiers",
      title: "Plans & pricing",
      description: "Edit prices, trial periods, and provider IDs for Free / Pro / Elite plans.",
      icon: Layers,
      accent: "from-fuchsia-500/15 to-fuchsia-500/5 ring-fuchsia-500/30",
    },
    {
      to: "/admin/features",
      title: "Feature matrix",
      description: "Toggle capabilities and per-period limits for each plan.",
      icon: Sliders,
      accent: "from-cyan-500/15 to-cyan-500/5 ring-cyan-500/30",
    },
    {
      to: "/admin/subscriptions",
      title: "Subscriptions",
      description: "Search subscribers, review plans, and grant comp / test entitlements.",
      icon: CreditCard,
      accent: "from-lime-500/15 to-lime-500/5 ring-lime-500/30",
    },
    {
      to: "/admin/billing-events",
      title: "Billing events",
      description: "Every Stripe / IAP webhook this project has received.",
      icon: Receipt,
      accent: "from-orange-500/15 to-orange-500/5 ring-orange-500/30",
    },
  ];

  const totalPending =
    (c?.pendingCourses ?? 0) +
    (c?.pendingEdits ?? 0) +
    (c?.pendingRatings ?? 0) +
    (c?.pendingReverts ?? 0);

  return (
    <PageShell>
      <PageHeader
        title="Admin dashboard"
        description="All admin tools in one place — moderation queues, configuration, and billing."
        eyebrow="Super admin"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={ShieldCheck}
          label="Total pending review"
          value={totalPending}
          hint="Courses + edits + ratings + reverts"
        />
        <StatTile icon={MapPin} label="Pending courses" value={c?.pendingCourses ?? 0} />
        <StatTile icon={Gauge} label="Pending rating profiles" value={c?.pendingRatings ?? 0} />
        <StatTile
          icon={FlaskConical}
          label="Sandbox rows"
          value={c?.mockRows ?? 0}
          hint="Seeded mock records"
        />
      </div>

      <ToolSection title="Review queues" tools={reviewTools} />
      <ToolSection title="Data & content" tools={dataTools} />
      <ToolSection title="Members & billing" tools={billingTools} />
    </PageShell>
  );
}

function ToolSection({ title, tools }: { title: string; tools: ToolCard[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tools.map((t) => (
          <ToolLink key={t.title + t.to} tool={t} />
        ))}
      </div>
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ToolLink({ tool }: { tool: ToolCard }) {
  const Icon = tool.icon;
  return (
    <Link
      to={tool.to}
      title={tool.description}
      className={cn(
        "group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition",
        "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{tool.title}</div>
        <div className="truncate text-xs text-muted-foreground">{tool.description}</div>
      </div>
      {tool.badge != null && tool.badge > 0 ? (
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {tool.badge}
        </span>
      ) : (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      )}
    </Link>
  );
}
